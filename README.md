# ENS Name Normalization UTS46 Implementation

* Generate entire family of [UTS46](https://unicode.org/reports/tr46/) `ToUnicode()` functions
* Passes **100%** [IDNATestV2](https://adraffy.github.io/ens-normalize.js/test/report-idna.html)
* Supports [ContextO](https://datatracker.ietf.org/doc/html/rfc5892#appendix-A)

## Example

```Javascript
import {create_uts46} from './uts46.js';

const uts46 = await create_uts46({
    version: 2003, 
    valid_deviations: true,
    check_hyphens: true,
    check_bidi: true,
    contextJ: true,
    check_leading_cm: true,
    punycode: true
});

console.log(uts46('RAFFY.ETH'));
```