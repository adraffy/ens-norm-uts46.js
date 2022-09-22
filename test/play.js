// confirm that the code is working

import {create_uts46} from '../src/uts46.js';

console.log(create_uts46({version: 2003})("RAFFY.ETH"));
console.log(create_uts46({version: 2003, nfc: cps => cps})("RAFFY.ETH"));
