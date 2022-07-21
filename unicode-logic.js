import {createReadStream} from 'fs';
import {createInterface} from 'readline'; 
import {parse_cp_range, parse_cp_sequence} from './utils.js';

export function unicode_file(name) {
	return new URL(`./download/unicode-raw/${name}.txt`, import.meta.url);
}

export async function read_semicolon_file(file, impl = {
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
	for await (let line of createInterface({input: createReadStream(file)})) {
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
	return root;
}


export async function read_idna_rules({version, use_STD3, valid_deviations}) {
	switch (version) {
		case 2003:
		case 2008: break;
		default: throw new TypeError(`Unknown IDNA version: ${version}`);
	}
	let {
		ignored,
		mapped,
		valid, 
		valid_NV8,
		valid_XV8,
		deviation_mapped,
		deviation_ignored,
		disallowed,
		disallowed_STD3_mapped,
		disallowed_STD3_valid,
		...extra
	} = await read_semicolon_file(unicode_file('IdnaMappingTable'), {
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
	if (Object.keys(extra).length > 0) {
		throw new Error(`Assumption wrong: Unknown IDNA Keys: ${Object.keys(extra)}`);
	}
	if (!use_STD3) {
		// disallowed_STD3_valid: the status is disallowed if UseSTD3ASCIIRules=true (the normal case); 
		// implementations that allow UseSTD3ASCIIRules=false would treat the code point as valid.
		valid.push(...disallowed_STD3_valid);
		// disallowed_STD3_mapped: the status is disallowed if UseSTD3ASCIIRules=true (the normal case); 
		// implementations that allow UseSTD3ASCIIRules=false would treat the code point as mapped.
		mapped.push(...disallowed_STD3_mapped);
	}
	if (version == 2003) {
		// There are two values: NV8 and XV8. NV8 is only present if the status is valid 
		// but the character is excluded by IDNA2008 from all domain names for all versions of Unicode. 
		valid.push(...valid_NV8);
		// XV8 is present when the character is excluded by IDNA2008 for the current version of Unicode.
		valid.push(...valid_XV8);
	} 
	// IDNA2008 allows the joiner characters (ZWJ and ZWNJ) in labels. 
	// By contrast, these are removed by the mapping in IDNA2003.
	if (version == 2008 || valid_deviations) { 
		valid.push(...deviation_mapped.map(([x]) => x));
		valid.push(...deviation_ignored);
	} else {
		mapped.push(...deviation_mapped);
		ignored.push(...deviation_ignored);
	}
	valid = new Set(valid.flatMap(parse_cp_range));
	ignored = new Set(ignored.flatMap(parse_cp_range));
	// x:[char] => ys:[char, char, ...]
	mapped = mapped.flatMap(([src, dst]) => {
		let cps = parse_cp_sequence(dst);
		// we need to re-apply the rules to the mapped output
		return cps.some(cp => ignored.has(cp) || !valid.has(cp)) ? [] : parse_cp_range(src).map(x => [x, cps]);
	});
	return {valid, ignored, mapped};
}

function parse_mapped_ranges(map) {
	return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, new Set(v.flatMap(parse_cp_range))]));
}

export async function parse_general_category_map() {
	return parse_mapped_ranges(await read_semicolon_file(unicode_file('DerivedGeneralCategory')));
}

export async function read_combining_mark_set() {
	return new Set(Object.entries(await parse_general_category_map()).flatMap(([k, v]) => k.startsWith('M') ? [...v] : []));
}

export async function read_combining_class_map() {
	return parse_mapped_ranges(await read_semicolon_file(unicode_file('DerivedCombiningClass')));
}

export async function read_virama_set() {
	let classes = await read_combining_class_map();
	return classes[9]; 
}

export async function read_bidi_class_map() {
	return parse_mapped_ranges(await read_semicolon_file(unicode_file('DerivedBidiClass')));
}

export async function read_joining_type_map() {
	return parse_mapped_ranges(await read_semicolon_file(unicode_file('DerivedJoiningType')));
}

export async function read_script_map() {
	return parse_mapped_ranges(await read_semicolon_file(unicode_file('Scripts')));
}

export async function read_idna_tests() {
	return read_semicolon_file(unicode_file('IdnaTestV2'), {
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
}