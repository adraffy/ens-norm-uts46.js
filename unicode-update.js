import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline'; 
import {writeFile, mkdir} from 'node:fs/promises';
import fetch from 'node-fetch';

// https://www.unicode.org/versions/latest/
const major = 14;
const minor = 0;
const patch = 0;

function url_for_public(s) {
	return `https://www.unicode.org/Public/${s}`;
}
function url_for_spec(s) {
	return url_for_public(`${major}.${minor}.${patch}/${s}`);
}
function url_for_idna(s) {
	return url_for_public(`idna/${major}.${minor}.${patch}/${s}`);
}
function url_for_emoji(s) {
	return url_for_public(`emoji/${major}.${minor}/${s}`);
}
function url_for_security(s) {
	return url_for_public(`/security/${major}.${minor}.${patch}/${s}`);
}

let urls = [
	url_for_idna('IdnaMappingTable.txt'),
	url_for_idna('IdnaTestV2.txt'),
	url_for_spec('ucd/extracted/DerivedGeneralCategory.txt'),
	url_for_spec('ucd/extracted/DerivedCombiningClass.txt'),
	url_for_spec('ucd/extracted/DerivedJoiningType.txt'),
	url_for_spec('ucd/extracted/DerivedBidiClass.txt'),
	url_for_spec('ucd/Scripts.txt'),
];

let raw_dir = new URL('./unicode-raw/', import.meta.url);
let parsed_dir = new URL('./unicode-parsed/', import.meta.url);
await mkdir(raw_dir, {recursive: true});
await mkdir(parsed_dir, {recursive: true});

// write a version file
await writeFile(new URL('version.json', raw_dir), JSON.stringify({major, minor, patch, date: new Date()}));

// download the unicode shit
await Promise.all(urls.map(async url => {
	let name = url.split('/').pop();
	let file = new URL(name, raw_dir);
	try {
		let res = await fetch(url);
		if (res.status != 200) throw new Error(`HTTP error ${res.status}`);
		let buf = await res.arrayBuffer();
		await writeFile(file, Buffer.from(buf));
		console.log(`Downloaded: ${url}`);
	} catch (err) {
		console.log(`Download "${name}" failed: ${err.message}`);
	}
}));

async function translate(name, impl = {
	row([src, cls]) {
		this.get_bucket(cls).push(src);
	}
}) {
	let scope = {
		root: {},
		...impl,
		get_bucket(key) {
			if (!key) throw new Error(`empty bucket key`);
			let bucket = root[key];
			if (!bucket) bucket = root[key] = [];
			return bucket;
		} 
	};
	let {root, row, comment} = scope;
	for await (let line of createInterface({input: createReadStream(new URL(`${name}.txt`, raw_dir))})) {
		let rest;
		let pos = line.indexOf('#');
		if (pos >= 0) {
			rest = line.slice(pos + 1).trim();
			line = line.slice(0, pos).trim();
		}
		if (line) {
			row?.call(scope, line.split(';').map(s => s.trim()), rest);
		} else if (rest) {
			comment?.call(scope, rest);
		}
	}
	let out_file = new URL(`${name}.json`, parsed_dir);
	await writeFile(out_file, JSON.stringify(root, null, 2));
	console.log(`Translated: ${out_file.pathname}`);
	return root;
}

await translate('IdnaTestV2', {
	test: 'COMPAT',
	comment(s) {
		let match = s.match(/^([A-Z ]*) TESTS$/);
		if (match) {
			this.test = match[1].trim();
		}
	},
	row([src, toUnicode, status]) {
		status = status.split(/[\[\],]/).map(x => x.trim()).filter(x => x);
		this.get_bucket(this.test).push([src, toUnicode, status]);
	}
});

let IDNA = await translate('IdnaMappingTable', {
	row([src, type, dst, status]) {
		if (!src) throw new Error('wtf src');
		if (type == 'deviation') type = dst ? 'deviation_mapped' : 'deviation_ignored';
		if (status) type = `${type}_${status}`; // NV8/XV8
		let bucket = this.get_bucket(type);
		if (type.includes('mapped')) {
			if (!dst) throw new Error('wtf dst');
			bucket.push([src, dst]);
		} else {
			bucket.push(src); 
		}
	}
});

let GeneralCategory = await translate('DerivedGeneralCategory');
let CombiningClass = await translate('DerivedCombiningClass');
let JoiningType = await translate('DerivedJoiningType');
let BidiClass = await translate('DerivedBidiClass');
let Scripts = await translate('Scripts');

function filter_keys(map, keys) {
	let ret = {};
	for (let key of keys) {
		let value = map[key];
		if (!value) throw new Error(`wtf key: ${key}`);
		ret[key] = value;
	}
	return ret;
}

Scripts = filter_keys(Scripts, ['Greek', 'Hebrew', 'Hiragana', 'Katakana', 'Han']);
JoiningType = filter_keys(JoiningType, ['T', 'D', 'L', 'R']);
BidiClass = filter_keys(BidiClass, ['R', 'AL', 'L', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'BN', 'NSM']);

let CM = Object.entries(GeneralCategory).flatMap(([k, v]) => k.startsWith('M') ? [...v] : []);

let out_file = new URL(`include.js`, parsed_dir);
await writeFile(out_file, `export default ${JSON.stringify({
	IDNA,
	CM,
	JoiningType,
	BidiClass,
	VIRAMA: CombiningClass[9],
	Scripts
}, null, '\t')};`);
console.log(`Created: ${out_file.pathname}`);