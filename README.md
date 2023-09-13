#  ens-norm-uts46.js

* Unicode `15.1.0` (but can be built using older versions)
* Generates entire family of [UTS-46](https://unicode.org/reports/tr46/) `ToUnicode()` functions
* Passes **100%** [IDNATestV2](https://unicode.org/reports/tr46/#Conformance_Testing)
* Supports [Context{J,O}](https://datatracker.ietf.org/doc/html/rfc5892#appendix-A)
* Supports [Punycode](https://github.com/adraffy/punycode.js)
* ⚠️ Uses `String.normalize()` for [NFC](https://unicode.org/reports/tr15/) (if no implementation is provided)
* ⚠️ Not space-efficient: [`~185 KB`](./dist/index.min.js) minified

## Example

```Javascript
import {create_uts46} from '@adraffy/ens-norm-uts46';
// npm i @adraffy/ens-norm-uts46
// browser: https://cdn.jsdelivr.net/npm/@adraffy/ens-norm-uts46@latest/dist/index.min.js

const uts46 = await create_uts46({
	version: 2003,
	use_STD3: true,
	valid_deviations: true, // deprecated in 15.1
	check_hyphens: true,
	check_bidi: true,
	contextJ: true,
	contextO: false,
	check_leading_cm: true,
	punycode: true
	nfc: cps => cps // number[] -> number[], leave unspecified for String.normalize()	
});

console.log(uts46('RAFFY.ETH'));
```

## Build

* `git clone` this repo then `npm install`
* `npm run derive` — download and parse Unicode data files
	* Creates [include.js](./src/include.js)
* `npm run test` — validate against IDNATestV2
* `npm run build` — create `/dist/`
