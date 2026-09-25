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
import roleOvr, {
	type FunctionalRole,
} from "../player/roleOvr.football.ts";

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

const OL_ROLES: FunctionalRole[] = [
	"LT",
	"LG",
	"C",
	"RG",
	"RT",
];

const WR_ROLES: FunctionalRole[] = [
	"WR_X",
	"WR_Z",
	"WR_SLOT",
];

const CB_ROLES: FunctionalRole[] = [
	"CB_OUTSIDE",
	"CB_OUTSIDE",
	"CB_SLOT",
];

const S_ROLES: FunctionalRole[] = [
	"FS",
	"SS",
	"BOX_SAFETY",
];

/*
 * Build a depth chart where the first several players
 * correspond to specific functional roles.
 *
 * This is a maximum-total-score assignment rather than
 * a greedy role-by-role sort.
 *
 * That matters because the best player at one role may
 * be even more valuable at another role.
 */
const genFunctionalRoleDepth = (
	players: PlayerFiltered[],
	pos: Position,
	roles: FunctionalRole[],
	maxCandidates: number,
): number[] => {
	const listedPlayers = players.filter(
		(p) => p.ratings.pos === pos,
	);

	let candidatePool: PlayerFiltered[];

	/*
	 * Prefer actual players at the requested position.
	 *
	 * If the roster does not contain enough of them,
	 * allow emergency out-of-position candidates.
	 */
	if (listedPlayers.length >= roles.length) {
		candidatePool = listedPlayers;
	} else {
		const emergencyPlayers =
			sortByPositionScore(
				players.filter(
					(p) => p.ratings.pos !== pos,
				),
				pos,
			);

		candidatePool = [
			...listedPlayers,
			...emergencyPlayers.slice(
				0,
				Math.max(
					0,
					maxCandidates -
						listedPlayers.length,
				),
			),
		];
	}

	if (candidatePool.length < roles.length) {
		return sortByPositionScore(
			players,
			pos,
		).map((p) => p.pid);
	}

	/*
	 * Precompute every candidate's functional role OVR.
	 */
	const roleScores = new Map<
		number,
		Map<FunctionalRole, number>
	>();

	for (const p of candidatePool) {
		const scores =
			new Map<FunctionalRole, number>();

		for (const role of roles) {
			scores.set(
				role,
				roleOvr(
					p.ratings as any,
					role,
				),
			);
		}

		roleScores.set(
			p.pid,
			scores,
		);
	}

	/*
	 * Keep the optimization pool small enough for fast
	 * roster auto-sorting while retaining plenty of
	 * realistic competition.
	 */
	candidatePool = [...candidatePool]
		.sort((a, b) => {
			const aScores =
				roleScores.get(a.pid)!;

			const bScores =
				roleScores.get(b.pid)!;

			const aBest = Math.max(
				...roles.map(
					(role) =>
						aScores.get(role)!,
				),
			);

			const bBest = Math.max(
				...roles.map(
					(role) =>
						bScores.get(role)!,
				),
			);

			if (bBest === aBest) {
				return b.pid - a.pid;
			}

			return bBest - aBest;
		})
		.slice(0, maxCandidates);

	let bestScore = -Infinity;

	let bestStarters:
		PlayerFiltered[] = [];

	const currentStarters:
		PlayerFiltered[] = [];

	const usedPids =
		new Set<number>();

	/*
	 * Search every valid role assignment.
	 *
	 * A player may occupy only one role.
	 */
	const search = (
		roleIndex: number,
		totalScore: number,
	) => {
		if (roleIndex === roles.length) {
			if (totalScore > bestScore) {
				bestScore = totalScore;

				bestStarters =
					currentStarters.slice();
			}

			return;
		}

		const role =
			roles[roleIndex]!;

		for (const p of candidatePool) {
			if (usedPids.has(p.pid)) {
				continue;
			}

			const scores =
				roleScores.get(p.pid);

			if (!scores) {
				continue;
			}

			const roleScore =
				scores.get(role);

			if (roleScore === undefined) {
				continue;
			}

			usedPids.add(p.pid);
			currentStarters.push(p);

			search(
				roleIndex + 1,
				totalScore +
					roleScore,
			);

			currentStarters.pop();
			usedPids.delete(p.pid);
		}
	};

	search(0, 0);

	if (
		bestStarters.length !==
		roles.length
	) {
		return sortByPositionScore(
			players,
			pos,
		).map((p) => p.pid);
	}

	const starterPids =
		new Set(
			bestStarters.map(
				(p) => p.pid,
			),
		);

	/*
	 * Role-specific starters come first.
	 *
	 * Everyone afterward remains in traditional
	 * generic positional order for now.
	 */
	const backups =
		sortByPositionScore(
			players.filter(
				(p) =>
					!starterPids.has(
						p.pid,
					),
			),
			pos,
		);

	return [
		...bestStarters.map(
			(p) => p.pid,
		),
		...backups.map(
			(p) => p.pid,
		),
	];
};

const genOlDepth = (
	players: PlayerFiltered[],
): number[] => {
	/*
	 * First five:
	 *
	 * LT
	 * LG
	 * C
	 * RG
	 * RT
	 */
	return genFunctionalRoleDepth(
		players,
		"OL",
		OL_ROLES,
		12,
	);
};

const genWrDepth = (
	players: PlayerFiltered[],
): number[] => {
	/*
	 * First three:
	 *
	 * X
	 * Z
	 * Slot
	 *
	 * Three-WR formations use all three.
	 *
	 * Two-WR formations use X and Z.
	 *
	 * One-WR formations use the X receiver.
	 */
	return genFunctionalRoleDepth(
		players,
		"WR",
		WR_ROLES,
		10,
	);
};

const genCbDepth = (
	players: PlayerFiltered[],
): number[] => {
	/*
	 * First three:
	 *
	 * Outside CB
	 * Outside CB
	 * Slot CB
	 *
	 * Two-CB formations use the two outside corners.
	 *
	 * Three-CB formations add the slot corner.
	 */
	return genFunctionalRoleDepth(
		players,
		"CB",
		CB_ROLES,
		10,
	);
};

const genSafetyDepth = (
	players: PlayerFiltered[],
): number[] => {
	/*
	 * First three:
	 *
	 * FS
	 * SS
	 * Box Safety
	 *
	 * Standard two-safety formations use FS and SS.
	 *
	 * The Box Safety is kept as the third specialized
	 * safety for future nickel, dime, and heavy-box
	 * personnel packages.
	 */
	return genFunctionalRoleDepth(
		players,
		"S",
		S_ROLES,
		8,
	);
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
		throw new Error(
			"Missing depth",
		);
	}

	const depth =
		helpers.deepCopy(
			initialDepth,
		);

	let players: PlayerFiltered[];

	/*
	 * Can't use getCopies in exhibition games.
	 *
	 * Exhibition games intentionally ignore fuzz.
	 */
	if (
		local.exhibitionGamePlayers
	) {
		players =
			playersRaw.map((p) => {
				const ratings =
					last(p.ratings);

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
					attrs: [
						"pid",
					],
					ratings: [
						"pos",
						"ovrs",
						...RATINGS,
					],
					season:
						g.get(
							"season",
						),
					showNoStats:
						true,
					showRookies:
						true,
					fuzz: true,
				},
			);
	}

	const positions = pos
		? [pos]
		: POSITIONS;

	for (const pos2 of positions) {
		if (onlyNewPlayers) {
			/*
			 * Add new players without otherwise
			 * disturbing the user's custom depth chart.
			 */
			const playersNotInDepth =
				players.filter(
					(p) =>
						!depth[
							pos2
						].includes(
							p.pid,
						),
				);

			for (
				const p of
					playersNotInDepth
			) {
				const pScore =
					score(
						p,
						pos2,
					);

				let added = false;

				for (
					let i = 0;
					i <
					depth[
						pos2
					].length;
					i++
				) {
					const p2 =
						players.find(
							(p3) =>
								p3.pid ===
								depth[
									pos2
								][i],
						);

					if (
						!p2 ||
						pScore >
							score(
								p2,
								pos2,
							)
					) {
						depth[
							pos2
						].splice(
							i,
							0,
							p.pid,
						);

						added = true;
						break;
					}
				}

				if (!added) {
					depth[
						pos2
					].push(
						p.pid,
					);
				}
			}
		} else if (
			pos2 === "OL"
		) {
			depth.OL =
				genOlDepth(
					players,
				);
		} else if (
			pos2 === "WR"
		) {
			depth.WR =
				genWrDepth(
					players,
				);
		} else if (
			pos2 === "CB"
		) {
			depth.CB =
				genCbDepth(
					players,
				);
		} else if (
			pos2 === "S"
		) {
			depth.S =
				genSafetyDepth(
					players,
				);
		} else {
			depth[pos2] =
				sortByPositionScore(
					players,
					pos2,
				).map(
					(p) =>
						p.pid,
				);
		}
	}

	return depth;
};

export default genDepth;