export interface UTS46Config {
	check_hyphens?: boolean,
	check_bidi?: boolean,
	contextJ?: boolean,
	contextO?: boolean,
	check_leading_cm?: boolean,
	punycode?: boolean,
	version: 2003 | 2008,
	use_STD3?: boolean,
	valid_deviations?: boolean
}

export function create_uts46(config: UTS46Config): (name: string) => string;