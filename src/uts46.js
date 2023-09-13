import {explode_cp, escape_unicode, parse_cp_range, parse_cp_sequence} from './utils.js';
import {puny_decode} from '@adraffy/punycode';
import DATA from './include.js';

function set(...a) {
	return new Set(a.flat().flatMap(parse_cp_range));
}
const CM = set(DATA.CM);
const JOIN_T = set(DATA.JoiningType.T);
const JOIN_LD = set(DATA.JoiningType.L, DATA.JoiningType.D);
const JOIN_RD = set(DATA.JoiningType.R, DATA.JoiningType.D);
const SCRIPT_GREEK = set(DATA.Scripts.Greek);
const SCRIPT_HEBREW = set(DATA.Scripts.Hebrew);
const SCRIPT_HKH = set(DATA.Scripts.Hiragana, DATA.Scripts.Katakana, DATA.Scripts.Han);
const BIDI_R_AL = set(DATA.BidiClass.R, DATA.BidiClass.AL);
const BIDI_L = set(DATA.BidiClass.L);
const BIDI_AN = set(DATA.BidiClass.AN);
const BIDI_EN = set(DATA.BidiClass.EN);
const BIDI_ECTOB = set(DATA.BidiClass.ES, DATA.BidiClass.CS, DATA.BidiClass.ET, DATA.BidiClass.ON, DATA.BidiClass.BN);
const BIDI_NSM = set(DATA.BidiClass.NSM);
const VIRAMA = set(DATA.VIRAMA);

function format_cp(cp) {
	return `"${escape_unicode(String.fromCodePoint(cp))}"`;
}

function label_error(label, error) {
	return new Error(`${error} in "${escape_unicode(label)}"`);
}

function nfc_native(cps) {
	return explode_cp(String.fromCodePoint(...cps).normalize('NFC'));
}

export function create_uts46({
	check_hyphens, check_bidi, contextJ, contextO, check_leading_cm, 
	punycode, version, use_STD3, valid_deviations, nfc = nfc_native
} = {}) {
	let unicode_15_1 = DATA.version.major > 15 || (DATA.version.major == 15 && DATA.version.minor >= 1);
	if (unicode_15_1) {
		// A boolean flag: Transitional_Processing (deprecated)
		valid_deviations = true;
	}
	let {valid, ignored, mapped} = read_idna_rules({use_STD3, version, valid_deviations});
	mapped = Object.fromEntries(mapped);
	let valid_puny = valid;
	if (punycode && !valid_deviations) {
		valid_puny = read_idna_rules({use_STD3, version, valid_deviations: true}).valid;
	}
	return function(name) {
		// https://unicode.org/reports/tr46/#Processing
		// https://unicode.org/reports/tr46/#Validity_Criteria
		// [Processing] 1.) Map
		let input = explode_cp(name).reverse(); // flip so we can pop
		let output = [];
		while (input.length) {
			let cp = input.pop();
			// deviation: Leave the code point unchanged in the string.
			// valid: Leave the code point unchanged in the string.		
			if (valid.has(cp)) {
				output.push(cp);
				continue;
			} 
			// ignored: Remove the code point from the string. This is equivalent to mapping the code point to an empty string.
			if (ignored.has(cp)) {
				continue;
			}
			// mapped: Replace the code point in the string by the value for the mapping in Section 5, IDNA Mapping Table.
			let cps = mapped[cp];
			if (cps) {
				output.push(...cps);
				continue;
			}
			if (unicode_15_1) {
				// [>15.1] disallowed: Leave the code point unchanged in the string. 
				// Note: The Convert/Validate step below checks for disallowed characters, after mapping and normalization.
				output.push(cp);
			} else {
				// [<15.1] disallowed: Leave the code point unchanged in the string, and record that there was an error.
				throw new Error(`Disallowed codepoint: ${format_cp(cp)}`);
			}
		}
		// [Processing] 2.) Normalize: Normalize the domain_name string to Unicode Normalization Form C.
		// [Processing] 3.) Break: Break the string into labels at U+002E ( . ) FULL STOP.
		let labels = String.fromCodePoint(...nfc(output)).split('.').map(label => {
			// [Processing] 4.) Convert/Validate
			try {				
				let cps = explode_cp(label);
				if (label.startsWith('xn--')) {
					if (!punycode) throw new Error(`Punycode: not allowed`);
					// Attempt to convert the rest of the label to Unicode according to Punycode [RFC3492].
					// https://www.rfc-editor.org/rfc/rfc3492.html
					// If that conversion fails, record that there was an error, and continue with the next label.
					try {
						cps = puny_decode(cps.slice(4));
						// With either Transitional or Nontransitional Processing, sources already in Punycode are validated without mapping. 
						// In particular, Punycode containing Deviation characters, such as href="xn--fu-hia.de" (for fuß.de) is not remapped. 
						// This provides a mechanism allowing explicit use of Deviation characters even during a transition period. 
						for (let cp of cps) {
							if (!valid_puny.has(cp)) {
								throw new Error(`Disallowed codepoint: ${format_cp(cp)}`);
							}
						}
						// [Validity] 1.) The label must be in Unicode Normalization Form NFC.
						let decoded = nfc(cps);
						if (cps.some((cp, i) => cp !== decoded[i])) {
							throw new Error(`Not normalized`);
						}
						// Otherwise replace the original label in the string by the results of the conversion. 
						label = String.fromCodePoint(...decoded);
					} catch (err) {
						throw new Error(`Punycode: ${err.message}`);
					}
				} else if (unicode_15_1) {
					// [Validity] 7.) Each code point in the label must only have certain Status values according to Section 5, IDNA Mapping Table: 
					// For Transitional Processing (deprecated), each value must be valid.
    				// For Nontransitional Processing, each value must be either valid or deviation.
					for (let cp of cps) {
						if (!valid.has(cp)) {
							throw new Error(`Disallowed codepoint: ${format_cp(cp)}`);
						}
					}
				}
				// [Validity] 1.) The label must be in Unicode Normalization Form NFC.
				// => satsified
				if (check_hyphens) {
					// [Validity] 2.) If CheckHyphens, the label must not contain a U+002D HYPHEN-MINUS character in both the third and fourth positions.
					if (label.slice(2, 4) === '--') throw new Error(`CheckHyphens: invalid label extension`);
					// [Validity] 3.) If CheckHyphens, the label must neither begin nor end with a U+002D HYPHEN-MINUS character.			
					if (label.startsWith('-')) throw new Error(`CheckHyphens: leading hyphen`);
					if (label.endsWith('-')) throw new Error(`CheckHyphens: trailing hyphen`);
				}
				// [Validity] 4.) The label must not contain a U+002E ( . ) FULL STOP.
				// => satsified
				if (check_leading_cm) {
					// [Validity] 5.) The label must not begin with a combining mark, that is: General_Category=Mark.
					if (CM.has(cps[0])) throw new Error(`Leading combining mark`);
				}
				// [Validity] 6.) For Nontransitional Processing, each value must be either valid or deviation.
				// => satisfied
				if (contextJ) {
					// [Validity] 8.) If CheckJoiners, the label must satisify the ContextJ rules
					try {
						validate_contextJ(cps);
					} catch (err) {
						throw new Error(`ContextJ: ${err.message}`);
					}
				}
				if (contextO) {
					try {
						validate_contextO(cps);
					} catch (err) {
						throw new Error(`ContextO: ${err.message}`);
					}
				}
				return {cps, label};
			} catch (err) {
				throw label_error(label, err.message);
			}
		});
		// [Validity] 9.) If CheckBidi, and if the domain name is a Bidi domain name, then the label 
		// must satisfy all six of the numbered conditions in [IDNA2008] RFC 5893, Section 2.
		// * The spec is ambiguious regarding when you can determine a domain name is bidi
		// * According to IDNATestV2, this is calculated AFTER puny decoding
		// https://unicode.org/reports/tr46/#Notation
		// A Bidi domain name is a domain name containing at least one character with BIDI_Class R, AL, or AN
		if (check_bidi && labels.some(x => x.cps.some(cp => BIDI_R_AL.has(cp) || BIDI_AN.has(cp)))) {
			for (let {label, cps} of labels) {
				try {
					validate_bidi_label(cps);
				} catch (err) {
					throw label_error(label, `CheckBidi: ${err.message}`);
				}
			}
		}
		return labels.map(x => x.label).join('.');
	};
}

export function read_idna_rules({version, use_STD3, valid_deviations}) {
	switch (version) {
		case 2003:
		case 2008: break;
		default: throw new TypeError(`unknown IDNA version: ${version}`);
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
	} = DATA.IDNA;
	if (Object.keys(extra).length > 0) {
		throw new Error(`unexpected IDNA keys: ${Object.keys(extra)}`);
	}
	if (!use_STD3) {
		// disallowed_STD3_valid: the status is disallowed if UseSTD3ASCIIRules=true (the normal case); 
		// implementations that allow UseSTD3ASCIIRules=false would treat the code point as valid.
		valid = valid.concat(disallowed_STD3_valid);
		// disallowed_STD3_mapped: the status is disallowed if UseSTD3ASCIIRules=true (the normal case); 
		// implementations that allow UseSTD3ASCIIRules=false would treat the code point as mapped.
		mapped = mapped.concat(disallowed_STD3_mapped);
	}
	if (version == 2003) {
		// There are two values: NV8 and XV8. NV8 is only present if the status is valid 
		// but the character is excluded by IDNA2008 from all domain names for all versions of Unicode. 
		// XV8 is present when the character is excluded by IDNA2008 for the current version of Unicode.
		valid = valid.concat(valid_NV8, valid_XV8);
	} 
	// IDNA2008 allows the joiner characters (ZWJ and ZWNJ) in labels. 
	// By contrast, these are removed by the mapping in IDNA2003.
	if (version == 2008 || valid_deviations) { 
		valid = valid.concat(deviation_mapped.map(([x]) => x), deviation_ignored);
	} else {
		mapped = mapped.concat(deviation_mapped);
		ignored = ignored.concat(deviation_ignored);
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


export function validate_bidi_label(cps) {
	if (cps.length == 0) return;
	// https://www.rfc-editor.org/rfc/rfc5893.txt
	// 1.) The first character must be a character with Bidi property L, R, 
	// or AL.  If it has the R or AL property, it is an RTL label; if it
	// has the L property, it is an LTR label.
	let last = cps.length - 1;
	if (BIDI_R_AL.has(cps[0])) { // RTL 
		// 2.) In an RTL label, only characters with the Bidi properties R, AL, AN, EN, ES, CS, ET, ON, BN, or NSM are allowed.
		if (!cps.every(cp => BIDI_R_AL.has(cp) || BIDI_AN.has(cp) || BIDI_EN.has(cp) || BIDI_ECTOB.has(cp) || BIDI_NSM.has(cp))) throw new Error(`RTL: disallowed properties`);
		// 3. In an RTL label, the end of the label must be a character with
		// Bidi property R, AL, EN, or AN, followed by zero or more
		// characters with Bidi property NSM.
		while (BIDI_NSM.has(cps[last])) last--;
		last = cps[last];
		if (!(BIDI_R_AL.has(last) || BIDI_EN.has(last) || BIDI_AN.has(last))) throw new Error(`RTL: disallowed ending`);
		// 4. In an RTL label, if an EN is present, no AN may be present, and vice versa.
		if (cps.some(cp => BIDI_EN.has(cp)) && cps.some(cp => BIDI_AN.has(cp))) throw new Error(`RTL: AN+EN`);
	} else if (BIDI_L.has(cps[0])) { // LTR
		// 5. In an LTR label, only characters with the Bidi properties L, EN, ES, CS, ET, ON, BN, or NSM are allowed.
		if (!cps.every(cp => BIDI_L.has(cp) || BIDI_EN.has(cp) || BIDI_ECTOB.has(cp) || BIDI_NSM.has(cp))) throw new Error(`LTR: disallowed properties`);
		// 6. end with L or EN .. 0+ NSM
		while (BIDI_NSM.has(cps[last])) last--;
		last = cps[last];
		if (!BIDI_L.has(last) && !BIDI_EN.has(last)) throw new Error(`LTR: disallowed ending`);
	} else {
		throw new Error(`unknown direction`);
	}
}

export function validate_contextJ(cps) {
	for (let i = 0, e = cps.length - 1; i <= e; i++) {
		switch (cps[i]) {
			case 0x200C: { 
				// ZERO WIDTH NON-JOINER (ZWNJ)
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.1	
				// If Canonical_Combining_Class(Before(cp)) .eq.  Virama Then True;
				if (i > 0 && VIRAMA.has(cps[i - 1])) continue;
				// If RegExpMatch((Joining_Type:{L,D})(Joining_Type:T)*\u200C(Joining_Type:T)*(Joining_Type:{R,D})) Then True;
				if (i > 0 && i < e) { // there is room on either side
					let head = i - 1;
					while (head > 0 && JOIN_T.has(cps[head])) head--; // T*
					if (JOIN_LD.has(cps[head])) { // L or D
						let tail = i + 1;
						while (tail < e && JOIN_T.has(cps[tail])) tail++; // T*
						if (JOIN_RD.has(cps[tail])) { // R or D
							continue;
						}
					}
				}
				break;
			}
			case 0x200D: {
				// ZERO WIDTH JOINER (ZWJ)
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.2
				// If Canonical_Combining_Class(Before(cp)) .eq.  Virama Then True;
				if (i > 0 && VIRAMA.has(cps[i-1])) continue;
				break;
			}
			default: continue;
		}
		// the default behavior above is to continue if the context is valid
		// we only fall-through if no context was matched
		throw new Error(`Invalid codepoint: ${format_cp(cps[i])}`);
	}
}

export function validate_contextO(cps) {
	for (let i = 0, e = cps.length - 1; i <= e; i++) {
		switch (cps[i]) {
			case 0x00B7: {
				// MIDDLE DOT
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.3
				// Between 'l' (U+006C) characters only, used to permit the Catalan
				// character ela geminada to be expressed.
				if (i > 0 && i < e && cps[i-1] == 0x6C && cps[i+1] == 0x6C) continue; 
				break;
			}
			case 0x0375: {
				// GREEK LOWER NUMERAL SIGN (KERAIA)
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.4
				// The script of the following character MUST be Greek.
				if (i < e && SCRIPT_GREEK.has(cps[i+1])) continue; 
				break;
			}
			case 0x05F3:
				// HEBREW PUNCTUATION GERESH
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.5
				// The script of the preceding character MUST be Hebrew.
			case 0x05F4: {
				// HEBREW PUNCTUATION GERSHAYIM
				// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.6		
				// The script of the preceding character MUST be Hebrew.
				if (i > 0 && SCRIPT_HEBREW.has(cps[i-1])) continue;
				break;
			}
			default: continue;
		}
		// the default behavior above is to continue if the context is valid
		// we only fall-through if no context was matched
		throw new Error(`Invalid codepoint: ${format_cp(cps[i])}}`);
	}
	// ARABIC-INDIC DIGITS
	// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.8
	// Can not be mixed with Extended Arabic-Indic Digits.
	// For All Characters: If cp .in. 06F0..06F9 Then False; End For;
	// EXTENDED ARABIC-INDIC DIGITS
	// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.9
	// Can not be mixed with Arabic-Indic Digits.
	// For All Characters: If cp .in. 0660..0669 Then False; End For
	if (cps.some(cp => cp >= 0x0660 && cp <= 0x0669) && cps.some(cp => cp >= 0x06F0 && cp <= 0x06F9)) {
		throw new Error(`Disallowed arabic-indic digit mixture`);
	}
	// KATAKANA MIDDLE DOT
	// https://datatracker.ietf.org/doc/html/rfc5892#appendix-A.7
	// The effect of this rule is to require at least one character in the label to be in one of those scripts.
	// For All Characters: If Script(cp) .in. {Hiragana, Katakana, Han} Then True; End For;
	if (cps.includes(0x30FB) && !cps.some(cp => SCRIPT_HKH.has(cp))) {
		throw new Error(`Disallowed katakana`);
	}
}