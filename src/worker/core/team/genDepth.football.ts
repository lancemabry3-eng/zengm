import { idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import {
	POSITIONS,
	RATINGS,
} from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";
import type {
	Player,
	PlayerFiltered,
} from "../../../common/types.ts";
import { last } from "../../../common/utils.ts";
import roleOvr from "../player/roleOvr.football.ts";

const score = (
	p: PlayerFiltered,
	pos: Position,
) => {
	let tempScore = p.ratings.ovrs[pos];

	if (p.ratings.pos === pos) {
		tempScore += 15;
	}

	return tempScore;
};

const sortByPositionScore = (
	players: PlayerFiltered[],
	pos: Position,
) => {
	return [...players].sort((a, b) => {
		const diff =
			score(b, pos) - score(a, pos);

		if (diff === 0) {
			return b.pid - a.pid;
		}

		return diff;
	});
};

const OL_ROLES = [
	"LT",
	"LG",
	"C",
	"RG",
	"RT",
] as const;

type OLRole = (typeof OL_ROLES)[number];

const getOlRoleScores = (
	p: PlayerFiltered,
): Record<OLRole, number> => {
	return {
		LT: roleOvr(p.ratings as any, "LT"),
		LG: roleOvr(p.ratings as any, "LG"),
		C: roleOvr(p.ratings as any, "C"),
		RG: roleOvr(p.ratings as any, "RG"),
		RT: roleOvr(p.ratings as any, "RT"),
	};
};

const genOlDepth = (
	players: PlayerFiltered[],
): number[] => {
	/*
	 * Football GM traditionally treats OL as one generic
	 * position. Our realism system assigns the five starting
	 * linemen to LT/LG/C/RG/RT based on role OVR.
	 *
	 * The returned order is:
	 *
	 * 0 = LT
	 * 1 = LG
	 * 2 = C
	 * 3 = RG
	 * 4 = RT
	 *
	 * Everyone after that remains a generic OL backup for now.
	 */

	const listedOl = players.filter(
		(p) => p.ratings.pos === "OL",
	);

	/*
	 * Normally a team should have enough real OL candidates.
	 * If it doesn't, allow emergency players into the search.
	 */
	let candidatePool: PlayerFiltered[];

	if (listedOl.length >= 5) {
		candidatePool = listedOl;
	} else {
		const emergencyPlayers =
			sortByPositionScore(
				players.filter(
					(p) => p.ratings.pos !== "OL",
				),
				"OL",
			);

		candidatePool = [
			...listedOl,
			...emergencyPlayers.slice(
				0,
				10 - listedOl.length,
			),
		];
	}

	if (candidatePool.length < 5) {
		return sortByPositionScore(
			players,
			"OL",
		).map((p) => p.pid);
	}

	/*
	 * Precompute every candidate's LT/LG/C/RG/RT ratings.
	 * This keeps the lineup search fast.
	 */
	const roleScores = new Map<
		number,
		Record<OLRole, number>
	>();

	for (const p of candidatePool) {
		roleScores.set(
			p.pid,
			getOlRoleScores(p),
		);
	}

	/*
	 * If a roster somehow contains a huge number of OL,
	 * limit the optimization pool to the 12 most useful
	 * candidates.
	 *
	 * Twelve players still gives us more than enough room
	 * for realistic competition while keeping auto-sort fast.
	 */
	candidatePool = [...candidatePool]
		.sort((a, b) => {
			const aScores =
				roleScores.get(a.pid)!;
			const bScores =
				roleScores.get(b.pid)!;

			const aBest = Math.max(
				...OL_ROLES.map(
					(role) => aScores[role],
				),
			);

			const bBest = Math.max(
				...OL_ROLES.map(
					(role) => bScores[role],
				),
			);

			if (bBest === aBest) {
				return b.pid - a.pid;
			}

			return bBest - aBest;
		})
		.slice(0, 12);

	let bestScore = -Infinity;
	let bestStarters: PlayerFiltered[] = [];

	const currentStarters: PlayerFiltered[] = [];
	const usedPids = new Set<number>();

	/*
	 * Search every valid five-man combination.
	 *
	 * This is intentionally not a simple greedy algorithm.
	 *
	 * Example:
	 * Player A: LT 90, LG 89
	 * Player B: LT 88, LG 70
	 *
	 * A greedy system might put Player A at LT and waste
	 * Player B. The optimal lineup is:
	 *
	 * B at LT
	 * A at LG
	 *
	 * This search finds that better combination.
	 */
	const search = (
		roleIndex: number,
		totalScore: number,
	) => {
		if (roleIndex === OL_ROLES.length) {
			if (totalScore > bestScore) {
				bestScore = totalScore;
				bestStarters =
					currentStarters.slice();
			}

			return;
		}

		const role = OL_ROLES[roleIndex];

		for (const p of candidatePool) {
			if (usedPids.has(p.pid)) {
				continue;
			}

			const scores =
				roleScores.get(p.pid);

			if (!scores) {
				continue;
			}

			usedPids.add(p.pid);
			currentStarters.push(p);

			search(
				roleIndex + 1,
				totalScore + scores[role],
			);

			currentStarters.pop();
			usedPids.delete(p.pid);
		}
	};

	search(0, 0);

	/*
	 * Something extremely strange happened if we couldn't
	 * construct five starters, so fall back to the old
	 * generic OL ranking.
	 */
	if (bestStarters.length !== 5) {
		return sortByPositionScore(
			players,
			"OL",
		).map((p) => p.pid);
	}

	const starterPids = new Set(
		bestStarters.map((p) => p.pid),
	);

	/*
	 * Keep backups after the five starters.
	 * For now backups use Football GM's traditional generic
	 * OL score. Later we'll add swing tackle/interior backup
	 * logic and position-specific substitutions.
	 */
	const backups = sortByPositionScore(
		players.filter(
			(p) => !starterPids.has(p.pid),
		),
		"OL",
	);

	return [
		...bestStarters.map((p) => p.pid),
		...backups.map((p) => p.pid),
	];
};

const genDepth = async (
	playersRaw: Player[],
	initialDepth: {
		QB: number[];
		RB: number[];
		WR: number[];
		TE: number[];
		OL: number[];
		DL: number[];
		LB: number[];
		CB: number[];
		S: number[];
		K: number[];
		P: number[];
		KR: number[];
		PR: number[];
	},
	onlyNewPlayers?: boolean,
	pos?: Position,
) => {
	if (initialDepth === undefined) {
		throw new Error("Missing depth");
	}

	const depth =
		helpers.deepCopy(initialDepth);

	let players;

	/*
	 * Can't use getCopies in exhibition games.
	 * Exhibition games also intentionally ignore fuzz.
	 */
	if (local.exhibitionGamePlayers) {
		players = playersRaw.map((p) => {
			const ratings = last(p.ratings);

			return {
				pid: p.pid,
				ratings,
			};
		});
	} else {
		players =
			await idb.getCopies.playersPlus(
				playersRaw,
				{
					attrs: ["pid"],
					ratings: [
						"pos",
						"ovrs",
						...RATINGS,
					],
					season: g.get("season"),
					showNoStats: true,
					showRookies: true,
					fuzz: true,
				},
			);
	}

	const positions = pos
		? [pos]
		: POSITIONS;

	for (const pos2 of positions) {
		if (onlyNewPlayers