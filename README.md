# ENS Name Normalization UTS46 Implementation

* Unicode `15.0.0`
* Generate entire family of [UTS46](https://unicode.org/reports/tr46/) `ToUnicode()` functions
* Passes **100%** [IDNATestV2](https://unicode.org/reports/tr46/#Conformance_Testing)
* Supports [ContextO](https://datatracker.ietf.org/doc/html/rfc5892#appendix-A)
* Uses `String.normalize()` for [NFC](https://unicode.org/reports/tr15/) (if no implementation is provided)

## Example

```Javascript
import {create_uts46} from '@adraffy/ens-norm-uts46'; 
// npm i @adraffy/ens-norm-uts46
// browser: https://unpkg.com/@adraffy/ens-norm-uts46@latest/dist/index.min.js

const uts46 = await create_uts46({
	version: 2003,
	use_STD3: true,
	valid_deviations: true,
	check_hyphens: true,
	check_bidi: true,
	contextJ: true,
	contextO: false,
	check_leading_cm: true,
	punycode: true
	// number[] -> number[]
	// falsy for String.normalize()
	nfc: cps => cps 
});

console.log(uts46('RAFFY.ETH'));
```

## Build

* `git clone` this repo then `npm install`
* `npm run derive` — download and parse Unicode data files
	* Uses `Node 18` for `fetch()`
	* Creates [include.js](./src/include.js)
* `npm run test` — validate against IDNATestV2
* `npm run build` — create `/dist/`
