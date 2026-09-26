import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import type {
	DefensiveFront,
	Formation,
	OffensivePersonnel,
} from "./types.ts";

type DefensiveRoleOrder = Partial<
	Record<Position, FunctionalRole[]>
>;

type OffensiveRoleOrder = Partial<
	Record<Position, FunctionalRole[]>
>;

const OL_ROLE_ORDER: FunctionalRole[] = [
	"LT",
	"LG",
	"C",
	"RG",
	"RT",
];

/*
 * Functional-role requirements for each offensive personnel
 * package.
 *
 * These describe which kinds of RBs, WRs, and TEs should be
 * preferred when that personnel package takes the field.
 *
 * OL remains governed by its LT/LG/C/RG/RT depth chart.
 */
export const OFFENSIVE_ROLES_BY_PERSONNEL: Record<
	OffensivePersonnel,
	OffensiveRoleOrder
> = {
	/*
	 * 11 personnel
	 *
	 * One versatile back.
	 * Three distinct receiver jobs.
	 * One receiving-oriented TE.
	 */
	"11": {
		RB: [
			"RB_FEATURE",
		],
		WR: [
			"WR_X",
			"WR_Z",
			"WR_SLOT",
		],
		TE: [
			"TE_RECEIVING",
		],
	},

	/*
	 * 12 personnel
	 *
	 * One feature back.
	 * Two outside receivers.
	 * One receiving TE plus one traditional Y.
	 *
	 * This allows the package to threaten the defense through
	 * the air while retaining much more blocking flexibility
	 * than 11 personnel.
	 */
	"12": {
		RB: [
			"RB_FEATURE",
		],
		WR: [
			"WR_X",
			"WR_Z",
		],
		TE: [
			"TE_RECEIVING",
			"TE_Y",
		],
	},

	/*
	 * 21 personnel
	 *
	 * One feature back plus a more physical second back.
	 * Two outside receivers.
	 * One traditional Y tight end.
	 */
	"21": {
		RB: [
			"RB_FEATURE",
			"RB_POWER",
		],
		WR: [
			"WR_X",
			"WR_Z",
		],
		TE: [
			"TE_Y",
		],
	},

	/*
	 * 22 personnel
	 *
	 * Heavy backfield and tight-end grouping.
	 *
	 * One power back.
	 * One short-yardage back.
	 * One X receiver.
	 * One blocking TE and one traditional Y.
	 */
	"22": {
		RB: [
			"RB_POWER",
			"RB_SHORT_YARDAGE",
		],
		WR: [
			"WR_X",
		],
		TE: [
			"TE_BLOCKING",
			"TE_Y",
		],
	},
};

export const getOffensiveRoleOrder = (
	formation: Formation,
	pos: Position,
): FunctionalRole[] | undefined => {
	/*
	 * OL role order is universal across every normal offensive
	 * personnel package. Keeping it here lets the game-sim
	 * role-depth optimizer reassign LT/LG/C/RG/RT when injuries
	 * change availability without making OL part of personnel-fit
	 * scoring.
	 */
	if (pos === "OL") {
		return OL_ROLE_ORDER;
	}

	const personnel =
		formation.offensivePersonnel;

	if (personnel === undefined) {
		return undefined;
	}

	return OFFENSIVE_ROLES_BY_PERSONNEL[
		personnel
	][pos];
};

/*
 * Functional-role requirements for each defensive front.
 *
 * These arrays describe the preferred players for that
 * specific personnel package.
 *
 * They do not replace the traditional position depth chart.
 * The game sim uses them to choose among eligible players
 * while retaining the existing depth chart as the fallback.
 */
export const DEFENSIVE_ROLES_BY_FRONT: Record<
	DefensiveFront,
	DefensiveRoleOrder
> = {
	NICKEL_4_2: {
		/*
		 * Nickel emphasizes pass rush on the edges while
		 * retaining two interior defensive tackles.
		 */
		DL: [
			"DL_EDGE",
			"DT",
			"DT",
			"DL_EDGE",
		],
		LB: [
			"MIKE",
			"WILL",
		],
		CB: [
			"CB_OUTSIDE",
			"CB_OUTSIDE",
			"CB_SLOT",
		],
		S: [
			"FS",
			"SS",
		],
	},

	BASE_3_4: {
		/*
		 * Traditional three-man front:
		 *
		 * DE
		 * NT
		 * DE
		 *
		 * The fourth linebacker is the primary EDGE rusher.
		 */
		DL: [
			"DE",
			"NT",
			"DE",
		],
		LB: [
			"LB_EDGE",
			"MIKE",
			"WILL",
			"SAM",
		],
		CB: [
			"CB_OUTSIDE",
			"CB_OUTSIDE",
		],
		S: [
			"FS",
			"SS",
		],
	},

	BASE_4_3: {
		/*
		 * Traditional four-man front:
		 *
		 * DE
		 * DT
		 * DT
		 * DE
		 */
		DL: [
			"DE",
			"DT",
			"DT",
			"DE",
		],
		LB: [
			"MIKE",
			"WILL",
			"SAM",
		],
		CB: [
			"CB_OUTSIDE",
			"CB_OUTSIDE",
		],
		S: [
			"FS",
			"SS",
		],
	},
};

export const getDefensiveRoleOrder = (
	formation: Formation,
	pos: Position,
): FunctionalRole[] | undefined => {
	const front =
		formation.defensiveFront;

	if (front === undefined) {
		return undefined;
	}

	return DEFENSIVE_ROLES_BY_FRONT[
		front
	][pos];
};

const normal: Formation[] = [
	/*
	 * 11 personnel
	 *
	 * 1 RB
	 * 1 TE
	 * 3 WR
	 *
	 * Nickel 4-2 is the default defensive answer.
	 */
	{
		offensivePersonnel: "11",
		defensiveFront: "NICKEL_4_2",
		off: {
			QB: 1,
			RB: 1,
			WR: 3,
			TE: 1,
			OL: 5,
		},
		def: {
			DL: 4,
			LB: 2,
			CB: 3,
			S: 2,
		},
	},

	/*
	 * 12 personnel
	 *
	 * 1 RB
	 * 2 TE
	 * 2 WR
	 *
	 * The realism GameSim answers this with the defending
	 * team's inferred base 3-4 or 4-3 front.
	 *
	 * BASE_4_3 here is only the template default.
	 */
	{
		offensivePersonnel: "12",
		defensiveFront: "BASE_4_3",
		off: {
			QB: 1,
			RB: 1,
			WR: 2,
			TE: 2,
			OL: 5,
		},
		def: {
			DL: 4,
			LB: 3,
			CB: 2,
			S: 2,
		},
	},

	/*
	 * 21 personnel
	 *
	 * 2 RB
	 * 1 TE
	 * 2 WR
	 *
	 * BASE_3_4 remains the template default.
	 *
	 * The realism GameSim can replace it with the defending
	 * team's own inferred base 3-4 or 4-3 scheme.
	 */
	{
		offensivePersonnel: "21",
		defensiveFront: "BASE_3_4",
		off: {
			QB: 1,
			RB: 2,
			WR: 2,
			TE: 1,
			OL: 5,
		},
		def: {
			DL: 3,
			LB: 4,
			CB: 2,
			S: 2,
		},
	},

	/*
	 * 22 personnel
	 *
	 * 2 RB
	 * 2 TE
	 * 1 WR
	 *
	 * BASE_4_3 remains the template default.
	 *
	 * The realism GameSim can replace it with the defending
	 * team's own inferred base 3-4 or 4-3 scheme.
	 */
	{
		offensivePersonnel: "22",
		defensiveFront: "BASE_4_3",
		off: {
			QB: 1,
			RB: 2,
			WR: 1,
			TE: 2,
			OL: 5,
		},
		def: {
			DL: 4,
			LB: 3,
			CB: 2,
			S: 2,
		},
	},

	/*
	 * No 5-wide formation yet because the existing engine
	 * produced too many quarterback runs with it.
	 *
	 * Similar limitations currently apply to 4-wide sets
	 * that completely remove the TE/RB.
	 */
];

const fieldGoal: Formation[] = [
	{
		off: {
			K: 1,
			P: 1,
			OL: 9,
		},
		def: {
			DL: 6,
			LB: 3,
			S: 2,
		},
	},
];

const kickoff: Formation[] = [
	{
		off: {
			K: 1,
			LB: 5,
			S: 3,
			CB: 2,
		},
		def: {
			KR: 2,
			LB: 5,
			S: 4,
		},
	},
];

const punt: Formation[] = [
	{
		off: {
			P: 1,
			RB: 1,
			OL: 7,
			CB: 2,
		},
		def: {
			PR: 1,
			DL: 6,
			S: 4,
		},
	},
];

export default {
	fieldGoal,
	kickoff,
	normal,
	punt,
};