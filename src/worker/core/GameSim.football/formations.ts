import type { Formation } from "./types.ts";

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