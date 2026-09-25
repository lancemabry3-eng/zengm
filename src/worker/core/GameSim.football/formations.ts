import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import type {
	DefensiveFront,
	Formation,
} from "./types.ts";

type DefensiveRoleOrder = Partial<
	Record<Position, FunctionalRole[]>
>;

/*
 * Functional-role requirements for each defensive front.
 *
 * These arrays describe the preferred players for that
 * specific personnel package.
 *
 * They do not replace the traditional position depth chart.
 * The game sim will use them to choose among eligible players
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
	 * Defense answers with a Nickel 4-2:
	 *
	 * 4 DL
	 * 2 LB
	 * 3 CB
	 * 2 S
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
	 * 21 personnel
	 *
	 * 2 RB
	 * 1 TE
	 * 2 WR
	 *
	 * Defense answers with a Base 3-4:
	 *
	 * 3 DL
	 * 4 LB
	 * 2 CB
	 * 2 S
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
	 * Defense answers with a Base 4-3:
	 *
	 * 4 DL
	 * 3 LB
	 * 2 CB
	 * 2 S
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