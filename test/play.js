// confirm that the code is working

import {create_uts46} from '../src/uts46.js';

console.log(create_uts46({version: 2003})("RAFFY.ETH"));
console.log(create_uts46({version: 2003, nfc: cps => cps})("RAFFY.ETH"));

try {
	console.log(create_uts46({version: 2003, use_STD3: true})("a b"));
} catch (err) {
	console.log(err);
}