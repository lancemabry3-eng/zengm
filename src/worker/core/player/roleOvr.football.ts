import { COMPOSITE_WEIGHTS } from "../../../common/constants.football.ts";
import type {
	PlayerRatings,
	PrimaryPosition,
	RatingKey,
} from "../../../common/types.football.ts";
import { helpers } from "../../util/index.ts";
import compositeRating from "./compositeRating.ts";

export type FunctionalRole =
	| "QB_POCKET"
	| "QB_CREATOR"
	| "QB_DUAL_THREAT"
	| "RB_FEATURE"
	| "RB_POWER"
	| "RB_RECEIVING"
	| "RB_THIRD_DOWN"
	| "RB_SHORT_YARDAGE"
	| "WR_X"
	| "WR_Z"
	| "WR_SLOT"
	| "WR_DEEP_THREAT"
	| "WR_POSSESSION"
	| "TE_Y"
	| "TE_RECEIVING"
	| "TE_BLOCKING"
	| "TE_H_BACK"
	| "LT"
	| "LG"
	| "C"
	| "RG"
	| "RT"
	| "DL_EDGE"
	| "DE"
	| "DT"
	| "NT"
	| "LB_EDGE"
	| "MIKE"
	| "WILL"
	| "SAM"
	| "CB_OUTSIDE"
	| "CB_SLOT"
	| "FS"
	| "SS"
	| "BOX_SAFETY";

export const FUNCTIONAL_ROLE_LABELS: Record<FunctionalRole, string> = {
	QB_POCKET: "Pocket Passer",
	QB_CREATOR: "Creator",
	QB_DUAL_THREAT: "Dual Threat",
	RB_FEATURE: "Feature Back",
	RB_POWER: "Power Back",
	RB_RECEIVING: "Receiving Back",
	RB_THIRD_DOWN: "Third-Down Back",
	RB_SHORT_YARDAGE: "Short-Yardage Back",
	WR_X: "X Receiver",
	WR_Z: "Z Receiver",
	WR_SLOT: "Slot Receiver",
	WR_DEEP_THREAT: "Deep Threat",
	WR_POSSESSION: "Possession Receiver",
	TE_Y: "Y Tight End",
	TE_RECEIVING: "Receiving Tight End",
	TE_BLOCKING: "Blocking Tight End",
	TE_H_BACK: "H-Back",
	LT: "Left Tackle",
	LG: "Left Guard",
	C: "Center",
	RG: "Right Guard",
	RT: "Right Tackle",
	DL_EDGE: "Edge Rusher",
	DE: "Defensive End",
	DT: "Defensive Tackle",
	NT: "Nose Tackle",
	LB_EDGE: "Edge Linebacker",
	MIKE: "Mike Linebacker",
	WILL: "Will Linebacker",
	SAM: "Sam Linebacker",
	CB_OUTSIDE: "Outside Corner",
	CB_SLOT: "Slot Corner",
	FS: "Free Safety",
	SS: "Strong Safety",
	BOX_SAFETY: "Box Safety",
};

export const FUNCTIONAL_ROLES_BY_POSITION: Record<
	PrimaryPosition,
	readonly FunctionalRole[]
> = {
	QB: ["QB_POCKET", "QB_CREATOR", "QB_DUAL_THREAT"],
	RB: [
		"RB_FEATURE",
		"RB_POWER",
		"RB_RECEIVING",
		"RB_THIRD_DOWN",
		"RB_SHORT_YARDAGE",
	],
	WR: ["WR_X", "WR_Z", "WR_SLOT", "WR_DEEP_THREAT", "WR_POSSESSION"],
	TE: ["TE_Y", "TE_RECEIVING", "TE_BLOCKING", "TE_H_BACK"],
	OL: ["LT", "LG", "C", "RG", "RT"],
	DL: ["DL_EDGE", "DE", "DT", "NT"],
	LB: ["LB_EDGE", "MIKE", "WILL", "SAM"],
	CB: ["CB_OUTSIDE", "CB_SLOT"],
	S: ["FS", "SS", "BOX_SAFETY"],
	K: [],
	P: [],
};

const COMPOSITE_KEYS = [
	"passingAccuracy",
	"passingDeep",
	"passingVision",
	"athleticism",
	"rushing",
	"catching",
	"gettingOpen",
	"speed",
	"passBlocking",
	"runBlocking",
	"passRushing",
	"runStopping",
	"passCoverage",
	"tackling",
	"avoidingSacks",
	"ballSecurity",
	"endurance",
	"kickingPower",
	"kickingAccuracy",
	"puntingPower",
	"puntingAccuracy",
] as const;

type CompositeKey =
	(typeof COMPOSITE_KEYS)[number];

type RoleComponent =
	| CompositeKey
	| RatingKey;

const COMPOSITE_KEY_SET =
	new Set<string>(
		COMPOSITE_KEYS,
	);

type RoleSpec = {
	position: PrimaryPosition;
	weights: Partial<Record<RoleComponent, number>>;
};

const ZERO_WEIGHT_RATIO: Record<PrimaryPosition, number> = {
	QB: -1.25 / 13,
	RB: -1.25 / 16,
	WR: 1.25 / 12,
	TE: -0.525 / 8,
	OL: 0.75 / 6,
	DL: 0.25 / 11,
	LB: -0.75 / 9,
	CB: 1 / 4.2,
	S: 0.1 / 3,
	K: 0,
	P: 0,
};

const ROLE_SPECS = {
	QB_POCKET: {
		position: "QB",
		weights: {
			passingAccuracy: 3,
			passingVision: 3.5,
			passingDeep: 2,
			avoidingSacks: 1.5,
			ballSecurity: 0.75,
		},
	},
	QB_CREATOR: {
		position: "QB",
		weights: {
			passingAccuracy: 2.5,
			passingVision: 2.5,
			passingDeep: 2,
			avoidingSacks: 2,
			athleticism: 1,
			rushing: 0.75,
			ballSecurity: 0.5,
		},
	},
	QB_DUAL_THREAT: {
		position: "QB",
		weights: {
			passingAccuracy: 2,
			passingVision: 1.75,
			passingDeep: 1.5,
			rushing: 3,
			athleticism: 2,
			avoidingSacks: 1,
			ballSecurity: 1,
		},
	},
	RB_FEATURE: {
		position: "RB",
		weights: {
			rushing: 5,
			catching: 1.25,
			gettingOpen: 0.75,
			ballSecurity: 2,
			passBlocking: 0.75,
			endurance: 1,
		},
	},
	RB_POWER: {
		position: "RB",
		weights: {
			rushing: 4,
			stre: 2.5,
			ballSecurity: 2,
			endurance: 1,
			catching: 0.5,
		},
	},
	RB_RECEIVING: {
		position: "RB",
		weights: {
			catching: 3,
			gettingOpen: 2.5,
			rushing: 2,
			ballSecurity: 1.5,
			passBlocking: 0.75,
			speed: 0.75,
		},
	},
	RB_THIRD_DOWN: {
		position: "RB",
		weights: {
			catching: 2.5,
			gettingOpen: 2,
			passBlocking: 2,
			rushing: 1.5,
			ballSecurity: 1.5,
			speed: 0.5,
		},
	},
	RB_SHORT_YARDAGE: {
		position: "RB",
		weights: {
			rushing: 3.5,
			stre: 3,
			ballSecurity: 2.5,
			endurance: 0.75,
		},
	},
	WR_X: {
		position: "WR",
		weights: {
			catching: 3,
			gettingOpen: 3,
			hgt: 1,
			speed: 1,
			ballSecurity: 0.75,
		},
	},
	WR_Z: {
		position: "WR",
		weights: {
			gettingOpen: 3.5,
			catching: 2.5,
			speed: 2,
			rushing: 0.5,
			ballSecurity: 0.5,
		},
	},
	WR_SLOT: {
		position: "WR",
		weights: {
			gettingOpen: 3.5,
			catching: 3,
			speed: 1,
			rushing: 0.75,
			ballSecurity: 0.75,
		},
	},
	WR_DEEP_THREAT: {
		position: "WR",
		weights: {
			speed: 3,
			gettingOpen: 3,
			catching: 2,
			hgt: 0.75,
			ballSecurity: 0.25,
		},
	},
	WR_POSSESSION: {
		position: "WR",
		weights: {
			catching: 4,
			gettingOpen: 3,
			hgt: 1,
			ballSecurity: 1,
			stre: 0.5,
		},
	},
	TE_Y: {
		position: "TE",
		weights: {
			catching: 2,
			gettingOpen: 2,
			passBlocking: 2.5,
			runBlocking: 2.5,
			stre: 0.75,
		},
	},
	TE_RECEIVING: {
		position: "TE",
		weights: {
			catching: 3,
			gettingOpen: 3,
			speed: 1,
			hgt: 0.75,
			runBlocking: 0.75,
		},
	},
	TE_BLOCKING: {
		position: "TE",
		weights: {
			passBlocking: 3,
			runBlocking: 4,
			stre: 1.25,
			catching: 0.5,
		},
	},
	TE_H_BACK: {
		position: "TE",
		weights: {
			runBlocking: 3,
			passBlocking: 1.5,
			catching: 1.5,
			gettingOpen: 1.5,
			athleticism: 1.25,
			rushing: 0.75,
		},
	},
	LT: {
		position: "OL",
		weights: {
			passBlocking: 4.5,
			runBlocking: 1.5,
			athleticism: 1.25,
			speed: 0.75,
			hgt: 0.5,
		},
	},
	LG: {
		position: "OL",
		weights: {
			runBlocking: 3.5,
			passBlocking: 2.5,
			stre: 1.5,
			athleticism: 0.75,
		},
	},
	C: {
		position: "OL",
		weights: {
			passBlocking: 3,
			runBlocking: 3,
			stre: 1.25,
			athleticism: 0.75,
			endurance: 0.5,
		},
	},
	RG: {
		position: "OL",
		weights: {
			runBlocking: 3.75,
			passBlocking: 2.5,
			stre: 1.75,
			athleticism: 0.5,
		},
	},
	RT: {
		position: "OL",
		weights: {
			passBlocking: 3.5,
			runBlocking: 2.5,
			stre: 1.25,
			athleticism: 1,
		},
	},
	DL_EDGE: {
		position: "DL",
		weights: {
			passRushing: 4.5,
			athleticism: 2,
			speed: 1.25,
			tackling: 1,
			runStopping: 1,
		},
	},
	DE: {
		position: "DL",
		weights: {
			passRushing: 3,
			runStopping: 2.5,
			athleticism: 1,
			stre: 1,
			tackling: 1,
		},
	},
	DT: {
		position: "DL",
		weights: {
			runStopping: 4,
			passRushing: 2,
			stre: 2,
			tackling: 1,
		},
	},
	NT: {
		position: "DL",
		weights: {
			runStopping: 5,
			stre: 3,
			tackling: 1,
			passRushing: 0.5,
		},
	},
	LB_EDGE: {
		position: "LB",
		weights: {
			passRushing: 4,
			athleticism: 2,
			tackling: 1.5,
			runStopping: 1.5,
			passCoverage: 0.5,
		},
	},
	MIKE: {
		position: "LB",
		weights: {
			tackling: 3,
			runStopping: 3,
			passCoverage: 1.5,
			athleticism: 1,
			stre: 0.75,
		},
	},
	WILL: {
		position: "LB",
		weights: {
			passCoverage: 2.5,
			tackling: 2.5,
			runStopping: 2,
			athleticism: 2,
			speed: 0.75,
		},
	},
	SAM: {
		position: "LB",
		weights: {
			runStopping: 2.5,
			tackling: 2.5,
			passRushing: 1.5,
			passCoverage: 1,
			stre: 1,
			athleticism: 0.5,
		},
	},
	CB_OUTSIDE: {
		position: "CB",
		weights: {
			passCoverage: 5,
			speed: 2,
			hgt: 1,
			tackling: 0.5,
		},
	},
	CB_SLOT: {
		position: "CB",
		weights: {
			passCoverage: 4.5,
			speed: 2,
			tackling: 1.5,
			athleticism: 0.75,
		},
	},
	FS: {
		position: "S",
		weights: {
			passCoverage: 4,
			speed: 2,
			tackling: 1,
			athleticism: 1,
		},
	},
	SS: {
		position: "S",
		weights: {
			tackling: 3,
			runStopping: 2,
			passCoverage: 2.5,
			stre: 1,
			athleticism: 0.5,
		},
	},
	BOX_SAFETY: {
		position: "S",
		weights: {
			tackling: 3,
			runStopping: 3,
			passRushing: 1,
			passCoverage: 1,
			stre: 1,
		},
	},
} satisfies Record<FunctionalRole, RoleSpec>;

const getComponentValue = (
	ratings: PlayerRatings,
	component: RoleComponent,
): number => {
	if (
		COMPOSITE_KEY_SET.has(
			component,
		)
	) {
		const info =
			COMPOSITE_WEIGHTS[
				component as CompositeKey
			];

		if (info === undefined) {
			throw new Error(
				`Unknown football composite role component "${component}"`,
			);
		}

		return compositeRating(
			ratings,
			info.ratings,
			info.weights,
			false,
		);
	}

	const rawRating =
		ratings[
			component as RatingKey
		];

	if (
		typeof rawRating !==
			"number"
	) {
		throw new Error(
			`Unknown football role component "${component}"`,
		);
	}

	return helpers.bound(
		rawRating / 100,
		0,
		1,
	);
};

const toOvrScale = (score: number): number => {
	const r = score * 100;

	let fudgeFactor = 0;

	if (r >= 68) {
		fudgeFactor = 15;
	} else if (r >= 62) {
		fudgeFactor = 5 + (r - 62) * (10 / 6);
	} else if (r >= 59) {
		fudgeFactor = (r - 59) * (5 / 3);
	} else if (r >= 52) {
		fudgeFactor = -5 + (r - 52) * (5 / 7);
	} else if (r >= 40) {
		fudgeFactor = -15 + (r - 40) * (10 / 12);
	} else {
		fudgeFactor = -15;
	}

	return helpers.bound(
		Math.round(r + fudgeFactor),
		0,
		100,
	);
};

const roleOvr = (
	ratings: PlayerRatings,
	role: FunctionalRole,
): number => {
	const spec = ROLE_SPECS[role];

	let numerator = 0;
	let totalWeight = 0;

	for (const [component, weight] of Object.entries(spec.weights)) {
		if (weight === undefined) {
			continue;
		}

		numerator +=
			getComponentValue(
				ratings,
				component as RoleComponent,
			) * weight;

		totalWeight += weight;
	}

	const zeroWeight =
		totalWeight * ZERO_WEIGHT_RATIO[spec.position];

	const denominator =
		totalWeight + zeroWeight;

	const score = helpers.bound(
		numerator / denominator,
		0,
		1,
	);

	return toOvrScale(score);
};

export const getRoleOvrs = (
	ratings: PlayerRatings,
	position: PrimaryPosition =
		ratings.pos as PrimaryPosition,
): Partial<Record<FunctionalRole, number>> => {
	const roles = FUNCTIONAL_ROLES_BY_POSITION[position];

	if (roles === undefined) {
		return {};
	}

	const output: Partial<
		Record<FunctionalRole, number>
	> = {};

	for (const role of roles) {
		output[role] = roleOvr(ratings, role);
	}

	return output;
};

export const getBestFunctionalRole = (
	ratings: PlayerRatings,
	position: PrimaryPosition =
		ratings.pos as PrimaryPosition,
):
	| {
			role: FunctionalRole;
			ovr: number;
	  }
	| undefined => {
	const roleOvrs = getRoleOvrs(
		ratings,
		position,
	);

	let best:
		| {
				role: FunctionalRole;
				ovr: number;
		  }
		| undefined;

	for (const [role, value] of Object.entries(roleOvrs)) {
		if (value === undefined) {
			continue;
		}

		if (
			best === undefined ||
			value > best.ovr
		) {
			best = {
				role: role as FunctionalRole,
				ovr: value,
			};
		}
	}

	return best;
};

export default roleOvr;