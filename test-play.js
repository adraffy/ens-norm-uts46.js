// confirm that the code is working

import {create_uts46} from './uts46.js';

const f = await create_uts46({version: 2003});

console.log(f("RAFFY.ETH"));