// perform IDNATestV2, fail on any error
// https://unicode.org/reports/tr46/#Conformance_Testing

import {create_uts46} from './uts46.js';
import {read_idna_tests} from './unicode-logic.js';

const uts46 = await create_uts46({
	version: 2003, 
	valid_deviations: true,
	check_hyphens: true,
	check_bidi: true,
	contextJ: true,
	check_leading_cm: true,
	punycode: true
});

for (let [test, cases] of Object.entries(await read_idna_tests())) {
	console.log(test, cases.length);
	for (let [input, output, errors] of cases) {
		// The special error codes X3 and X4_2 are now returned where a toASCII error code
		errors = errors.filter(x => x != 'X4_2' && x != 'X3');          
		if (!output) output = input;
		let norm, norm_err;
		try {
			norm = uts46(input);
		} catch (err) {
			norm_err = err.message;
		}
		let type;
		if (errors.length > 0) {
			if (norm_err) {
				type = 'same-error';
			} else {
				type = 'allow-error';
			}
		} else {
			if (norm_err) {
				type = 'reject-valid';
			} else if (norm !== output) {
				type = 'diff-norm';
			} else {
				type = 'same-norm';
			}
		}
		if (!type.startsWith('same')) {
			console.log({input, output, errors, norm, norm_err, type});
			process.exit(1);
		}
	}
}

console.log('OK');