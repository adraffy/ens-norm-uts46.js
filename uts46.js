import {explode_cp, escape_unicode} from './utils.js';
import {read_idna_rules, read_bidi_class_map, read_combining_mark_set, read_joining_type_map, read_script_map, read_virama_set} from './unicode-logic.js';
import {puny_decode} from './puny.js';

const CM = await read_combining_mark_set();

const {T: JOIN_T, D: JOIN_D, L: JOIN_L, R: JOIN_R} = await read_joining_type_map();
const JOIN_LD = new Set([...JOIN_D, ...JOIN_L]);
const JOIN_RD = new Set([...JOIN_D, ...JOIN_R]);

const {R: BIDI_R, AL: BIDI_AL, L: BIDI_l, AN: BIDI_AN, EN: BIDI_EN, ES: BIDI_ES, CS: BIDI_CS, ET: BIDI_ET, ON: BIDI_ON, BN: BIDI_BN, NSM: BIDI_NSM} = await read_bidi_class_map();
const R_AL = new Set([...BIDI_R, ...BIDI_AL]);
const ECTOB = new Set([...BIDI_ES, ...BIDI_CS, ...BIDI_ET, ...BIDI_ON, ...BIDI_BN]);

const {Greek: SCRIPT_GREEK, Hebrew: SCRIPT_HEBREW, Hiragana, Katakana, Han} = await read_script_map();
const SCRIPT_HKH = new Set([...Hiragana, ...Katakana, ...Han])

const VIRAMA = await read_virama_set();

function format_cp(cp) {
	return `"${escape_unicode(String.fromCodePoint(cp))}"`;
}

function label_error(label, error) {
	return new Error(`${error} in "${escape_unicode(label)}"`);
}

export async function create_uts46({
	check_hyphens, check_bidi, contextJ, contextO, check_leading_cm, 
	punycode, version, use_STD3 = true, valid_deviations
} = {}) {	
	let {valid, ignored, mapped} = await read_idna_rules({use_STD3, version, valid_deviations});
	mapped = Object.fromEntries(mapped);
	let valid_puny = valid;
	if (punycode && !valid_deviations) {
		valid_puny = await read_idna_rules({use_STD3, version, valid_deviations: true}).valid;
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
			// disallowed: Leave the code point unchanged in the string, and record that there was an error.		
			throw new Error(`Disallowed codepoint: ${format_cp(cp)}`);
		}
		// [Processing] 2.) Normalize: Normalize the domain_name string to Unicode Normalization Form C.
		// [Processing] 3.) Break: Break the string into labels at U+002E ( . ) FULL STOP.
		let labels = String.fromCodePoint(...output).normalize('NFC').split('.').map(label => {
			// [Processing] 4.) Convert/Validate
			try {				
				let cps = explode_cp(label);
				if (punycode && label.startsWith('xn--')) {
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
						let decoded = String.fromCodePoint(...cps);
						if (decoded !== decoded.normalize('NFC')) {
							throw new Error(`Not normalized`);
						}
						// Otherwise replace the original label in the string by the results of the conversion. 
						label = decoded;
					} catch (err) {
						throw new Error(`Punycode: ${err.message}`);
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
					// [Validity] 7.) If CheckJoiners, the label must satisify the ContextJ rules
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
		// [Validity] 8.) If CheckBidi, and if the domain name is a Bidi domain name, then the label 
		// must satisfy all six of the numbered conditions in [IDNA2008] RFC 5893, Section 2.
		// * The spec is ambiguious regarding when you can determine a domain name is bidi
		// * According to IDNATestV2, this is calculated AFTER puny decoding
		// https://unicode.org/reports/tr46/#Notation
		// A Bidi domain name is a domain name containing at least one character with BIDI_Class R, AL, or AN
		if (check_bidi && labels.some(x => x.cps.some(cp => R_AL.has(cp) || BIDI_AN.has(cp)))) {
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

export function validate_bidi_label(cps) {
	if (cps.length == 0) return;
	// https://www.rfc-editor.org/rfc/rfc5893.txt
	// 1.) The first character must be a character with Bidi property L, R, 
	// or AL.  If it has the R or AL property, it is an RTL label; if it
	// has the L property, it is an LTR label.
	let last = cps.length - 1;
	if (R_AL.has(cps[0])) { // RTL 
		// 2.) In an RTL label, only characters with the Bidi properties R, AL, AN, EN, ES, CS, ET, ON, BN, or NSM are allowed.
		if (!cps.every(cp => R_AL.has(cp) || BIDI_AN.has(cp) || BIDI_EN.has(cp) || ECTOB.has(cp) || BIDI_NSM.has(cp))) throw new Error(`RTL: disallowed properties`);
		// 3. In an RTL label, the end of the label must be a character with
		// Bidi property R, AL, EN, or AN, followed by zero or more
		// characters with Bidi property NSM.
		while (BIDI_NSM.has(cps[last])) last--;
		last = cps[last];
		if (!(R_AL.has(last) || BIDI_EN.has(last) || BIDI_AN.has(last))) throw new Error(`RTL: disallowed ending`);
		// 4. In an RTL label, if an EN is present, no AN may be present, and vice versa.
		if (cps.some(cp => BIDI_EN.has(cp)) && cps.some(cp => BIDI_AN.has(cp))) throw new Error(`RTL: AN+EN`);
	} else if (BIDI_l.has(cps[0])) { // LTR
		// 5. In an LTR label, only characters with the Bidi properties L, EN, ES, CS, ET, ON, BN, or NSM are allowed.
		if (!cps.every(cp => BIDI_l.has(cp) || BIDI_EN.has(cp) || ECTOB.has(cp) || BIDI_NSM.has(cp))) throw new Error(`LTR: disallowed properties`);
		// 6. end with L or EN .. 0+ NSM
		while (BIDI_NSM.has(cps[last])) last--;
		last = cps[last];
		if (!BIDI_l.has(last) && !BIDI_EN.has(last)) throw new Error(`LTR: disallowed ending`);
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