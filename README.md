# ENS Name Normalization UTS46 Implementation

* Generate entire family of [UTS46](https://unicode.org/reports/tr46/) `ToUnicode()` functions
* Passes **100%** [IDNATestV2](https://unicode.org/reports/tr46/#Conformance_Testing)
* Supports [ContextO](https://datatracker.ietf.org/doc/html/rfc5892#appendix-A) 

## Example

```Javascript
import {create_uts46} from '@adraffy/ens-norm-uts46.js'; // npm i @adraffy/ens-norm-uts46.js
// browser: https://unpkg.com/@adraffy/ens-norm-uts46.js@latest/dist/index.min.js

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
});

console.log(uts46('RAFFY.ETH'));
```

## Build

* `npm run update` &mdash; download and parse latest Unicode data
* `npm run test` &mdash; run IDNATestV2
* `npm run build` &mdash; create /dist/