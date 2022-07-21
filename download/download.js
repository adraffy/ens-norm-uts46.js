import fetch from 'node-fetch';
import {writeFile, mkdir, access} from 'fs/promises';
import {join} from 'path';

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

let base_dir = new URL('.', import.meta.url).pathname;
let raw_dir = join(base_dir, 'unicode-raw');
await mkdir(raw_dir, {recursive: true});
console.log(`Directory: ${raw_dir}`);	

let skip = process.argv.includes('--skip');
console.log(`Skip: ${skip}`);

// write a version file
await writeFile(join(raw_dir, 'version.json'), JSON.stringify({major, minor, patch, date: new Date()}));

// download the unicode shit
await Promise.all(urls.map(async url => {
	let name = url.split('/').pop();
	let file = join(raw_dir, name);
	if (skip && !(await access(file).catch(() => true))) {
		console.log(`Skipped: ${name}`);
		return;
	}
	try {
		let res = await fetch(url);
		if (res.status != 200) throw new Error(`HTTP error ${res.status}`);
		let buf = await res.arrayBuffer();
		await writeFile(file, Buffer.from(buf));
		console.log(`Downloaded: ${url} => ${file}`);
	} catch (err) {
		console.log(`Download "${name}" failed: ${err.message}`);
	}
}));
