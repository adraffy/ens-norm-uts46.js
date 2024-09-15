#  ens-norm-uts46.js

* Unicode `16.0.0` (but can be [built](#build) using any version)
* Generates entire family of [UTS-46](https://unicode.org/reports/tr46/) `ToUnicode()` functions
	- Supports [Bidi](https://datatracker.ietf.org/doc/html/rfc5893#section-2), [Context{J,O}](https://datatracker.ietf.org/doc/html/rfc5892#appendix-A), and [Punycode](https://github.com/adraffy/punycode.js)
* ✅️ Passes **100%** [IDNATestV2](https://unicode.org/reports/tr46/#Conformance_Testing)
* ⚠️ Uses `String.normalize()` for [NFC](https://unicode.org/reports/tr15/) (if no implementation is provided)
* ⚠️ Designed for testing (not space-efficient! [`~188 KB`](./dist/index.min.js) minified)

`npm i @adraffy/ens-norm-uts46` [&check;](https://www.npmjs.com/package/@adraffy/ens-norm-uts46)

## Example

```js
import {create_uts46} from '@adraffy/ens-norm-uts46';
// browser: https://cdn.jsdelivr.net/npm/@adraffy/ens-norm-uts46@latest/dist/index.min.js

const uts46 = create_uts46({
	version: 2003,
	use_STD3: true,
	valid_deviations: true, // deprecated in 15.1
	check_hyphens: true,
	check_bidi: true,
	contextJ: true,
	contextO: false,
	check_leading_cm: true,
	punycode: true, // uses @adraffy/punycode.js
	nfc: cps => cps // number[] -> number[], leave unspecified for String.normalize()	
});

console.log(uts46('RAFFY.ETH'));
```

## Build

* `npm i`
* `npm run derive` — download and parse Unicode data files
	* edit [make.js](./derive/make.js) to change Unicode version
	* creates [include.js](./src/include.js)
* `npm run test` — validate against IDNATestV2
* `npm run build` — create `/dist/`
