import { POSITIONS } from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";
import helpers from "../../util/helpers.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import {
	DEFENSIVE_ROLES_BY_FRONT,
	OFFENSIVE_ROLES_BY_PERSONNEL,
	getDefensiveRoleOrder,
	getOffensiveRoleOrder,
} from "./formations.ts";
import type {
	Formation,
	OffensivePersonnel,
	PassConcept,
	PlayerGameSim,
	PlayersOnField,
	TeamGameSim,
} from "./types.ts";

/*
 * Each positional depth array remains stable throughout a
 * game simulation.
 *
 * Functional role ratings also remain stable during the game,
 * so role-based depth orders can safely be cached.
 *
 * This prevents the maximum-score assignment search from
 * running again on every snap.
 */
const roleDepthCache = new WeakMap<
	PlayerGameSim[],
	Map<string, PlayerGameSim[]>
>();

const getRoleCacheKey = (
	roles: FunctionalRole[],
): string => {
	return roles.join("|");
};

/*
 * Reorder a positional depth chart around a specific set
 * of functional roles.
 *
 * This performs a maximum-total-score assignment rather
 * than greedily filling one role at a time.
 *
 * Example:
 *
 * A 3-4 front can request:
 *
 * DE
 * NT
 * DE
 *
 * while a 4-3 can request:
 *
 * DE
 * DT
 * DT
 * DE
 *
 * The chosen role players are moved to the front of the
 * returned array. Everyone else keeps their original depth
 * chart order behind them.
 *
 * If role ratings are unavailable, the original depth chart
 * is returned unchanged. This preserves compatibility with
 * older tests and manually constructed game-sim players.
 */
export const getRoleBasedDepth = (
	depth: PlayerGameSim[],
	roles: FunctionalRole[],
): PlayerGameSim[] => {
	if (
		roles.length === 0 ||
		depth.length < roles.length
	) {
		return depth;
	}

	const cacheKey =
		getRoleCacheKey(roles);

	let cacheForDepth =
		roleDepthCache.get(depth);

	if (!cacheForDepth) {
		cacheForDepth =
			new Map<
				string,
				PlayerGameSim[]
			>();

		roleDepthCache.set(
			depth,
			cacheForDepth,
		);
	}

	const cached =
		cacheForDepth.get(
			cacheKey,
		);

	if (cached) {
		return cached;
	}

	let bestScore = -Infinity;

	let bestPlayers:
		PlayerGameSim[] = [];

	const currentPlayers:
		PlayerGameSim[] = [];

	const usedPlayerIds =
		new Set<number>();

	const search = (
		roleIndex: number,
		totalScore: number,
	) => {
		if (
			roleIndex ===
			roles.length
		) {
			if (
				totalScore >
				bestScore
			) {
				bestScore =
					totalScore;

				bestPlayers =
					currentPlayers.slice();
			}

			return;
		}

		const role =
			roles[roleIndex]!;

		for (const p of depth) {
			if (
				usedPlayerIds.has(
					p.id,
				)
			) {
				continue;
			}

			const roleScore =
				p.roleOvrs?.[role];

			if (
				roleScore ===
				undefined
			) {
				continue;
			}

			usedPlayerIds.add(
				p.id,
			);

			currentPlayers.push(
				p,
			);

			search(
				roleIndex + 1,
				totalScore +
					roleScore,
			);

			currentPlayers.pop();

			usedPlayerIds.delete(
				p.id,
			);
		}
	};

	search(0, 0);

	if (
		bestPlayers.length !==
		roles.length
	) {
		cacheForDepth.set(
			cacheKey,
			depth,
		);

		return depth;
	}

	const rolePlayerIds =
		new Set(
			bestPlayers.map(
				(p) => p.id,
			),
		);

	const reorderedDepth = [
		...bestPlayers,
		...depth.filter(
			(p) =>
				!rolePlayerIds.has(
					p.id,
				),
		),
	];

	cacheForDepth.set(
		cacheKey,
		reorderedDepth,
	);

	return reorderedDepth;
};

const offensivePersonnelFitCache =
	new WeakMap<
		TeamGameSim,
		Map<
			OffensivePersonnel,
			number | undefined
		>
	>();

export const getOffensivePersonnelFit = (
	team: TeamGameSim,
	personnel: OffensivePersonnel,
): number | undefined => {
	let cacheForTeam =
		offensivePersonnelFitCache.get(
			team,
		);

	if (!cacheForTeam) {
		cacheForTeam =
			new Map<
				OffensivePersonnel,
				number | undefined
			>();

		offensivePersonnelFitCache.set(
			team,
			cacheForTeam,
		);
	}

	if (
		cacheForTeam.has(
			personnel,
		)
	) {
		return cacheForTeam.get(
			personnel,
		);
	}

	let totalScore = 0;
	let roleCount = 0;

	for (
		const pos of
			["RB", "WR", "TE"] as const
	) {
		const roles =
			OFFENSIVE_ROLES_BY_PERSONNEL[
				personnel
			][pos];

		if (
			roles === undefined ||
			roles.length === 0
		) {
			continue;
		}

		const depth =
			team.depth[pos];

		if (
			depth === undefined ||
			depth.length <
				roles.length
		) {
			cacheForTeam.set(
				personnel,
				undefined,
			);

			return undefined;
		}

		const orderedDepth =
			getRoleBasedDepth(
				depth,
				roles,
			);

		for (
			let i = 0;
			i < roles.length;
			i++
		) {
			const role =
				roles[i]!;

			const p =
				orderedDepth[i];

			const score =
				p?.roleOvrs?.[
					role
				];

			if (
				score ===
				undefined
			) {
				cacheForTeam.set(
					personnel,
					undefined,
				);

				return undefined;
			}

			totalScore +=
				score;

			roleCount += 1;
		}
	}

	const fit =
		roleCount > 0
			? totalScore /
				roleCount
			: undefined;

	cacheForTeam.set(
		personnel,
		fit,
	);

	return fit;
};

const maxDefined = (
	values: Array<number | undefined>,
): number | undefined => {
	let best: number | undefined;

	for (const value of values) {
		if (
			value !== undefined &&
			(best === undefined ||
				value > best)
		) {
			best = value;
		}
	}

	return best;
};

/*
 * Concept-aware target weighting.
 *
 * This keeps the existing on-field personnel intact while
 * allowing the selected pass concept to favor the players
 * whose functional roles actually fit the route family.
 *
 * Examples:
 *
 * - Deep shots favor deep-threat/X/Z receivers.
 * - Quick game favors slot/possession targets.
 * - Screens favor receiving/third-down backs and slot/Z WRs.
 * - Play action gives receiving TEs and outside WRs more value.
 *
 * Raw receiving skill still matters, so a role label never
 * completely overrides actual catching/getting-open ability.
 */
const getPassTargetRoleScore = (
	p: PlayerGameSim,
	concept: PassConcept,
): number | undefined => {
	if (concept === "QUICK_GAME") {
		return maxDefined([
			p.roleOvrs?.WR_SLOT,
			p.roleOvrs?.WR_POSSESSION,
			p.roleOvrs?.WR_Z,
			p.roleOvrs?.TE_RECEIVING,
			p.roleOvrs?.RB_RECEIVING,
			p.roleOvrs?.RB_THIRD_DOWN,
		]);
	}

	if (concept === "INTERMEDIATE") {
		return maxDefined([
			p.roleOvrs?.WR_X,
			p.roleOvrs?.WR_Z,
			p.roleOvrs?.WR_POSSESSION,
			p.roleOvrs?.TE_RECEIVING,
			p.roleOvrs?.TE_Y,
			p.roleOvrs?.RB_RECEIVING,
		]);
	}

	if (concept === "DEEP_SHOT") {
		return maxDefined([
			p.roleOvrs?.WR_DEEP_THREAT,
			p.roleOvrs?.WR_X,
			p.roleOvrs?.WR_Z,
			p.roleOvrs?.TE_RECEIVING,
		]);
	}

	if (concept === "PLAY_ACTION") {
		return maxDefined([
			p.roleOvrs?.WR_X,
			p.roleOvrs?.WR_Z,
			p.roleOvrs?.TE_RECEIVING,
			p.roleOvrs?.TE_Y,
			p.roleOvrs?.RB_RECEIVING,
		]);
	}

	return maxDefined([
		p.roleOvrs?.RB_RECEIVING,
		p.roleOvrs?.RB_THIRD_DOWN,
		p.roleOvrs?.WR_SLOT,
		p.roleOvrs?.WR_Z,
	]);
};

export const getPassTargetWeight = (
	p: PlayerGameSim,
	concept: PassConcept,
): number => {
	const roleScore =
		getPassTargetRoleScore(
			p,
			concept,
		);

	const roleFactor =
		roleScore === undefined
			? 1
			: helpers.bound(
					0.7 +
						(roleScore / 100) *
							0.9,
					0.7,
					1.6,
				);

	const catching =
		Math.max(
			0.05,
			p.compositeRating
				.catching,
		);

	const gettingOpen =
		Math.max(
			0.05,
			p.compositeRating
				.gettingOpen,
		);

	const speed =
		Math.max(
			0.05,
			p.compositeRating
				.speed,
		);

	const rushing =
		Math.max(
			0.05,
			p.compositeRating
				.rushing,
		);

	const energy =
		helpers.bound(
			p.stat.energy ?? 1,
			0.25,
			1,
		);

	let skillWeight: number;

	if (concept === "QUICK_GAME") {
		skillWeight =
			catching * 0.5 +
			gettingOpen * 0.5;
	} else if (
		concept ===
		"DEEP_SHOT"
	) {
		skillWeight =
			gettingOpen * 0.45 +
			speed * 0.35 +
			catching * 0.2;
	} else if (
		concept ===
		"PLAY_ACTION"
	) {
		skillWeight =
			gettingOpen * 0.55 +
			catching * 0.3 +
			speed * 0.15;
	} else if (
		concept ===
		"SCREEN"
	) {
		skillWeight =
			catching * 0.35 +
			rushing * 0.35 +
			speed * 0.3;
	} else {
		skillWeight =
			gettingOpen * 0.6 +
			catching * 0.4;
	}

	return (
		Math.max(
			0.01,
			skillWeight,
		) **
			1.5 *
		roleFactor *
		energy
	);
};

/*
 * Concept-aware coverage weighting.
 *
 * The defender still needs real pass-coverage ability, but
 * functional roles decide which kinds of defenders are most
 * naturally involved in each pass concept.
 *
 * Deep shots emphasize outside corners and safeties.
 * Quick game emphasizes slot coverage and underneath LBs.
 * Screens give tackling more weight than other concepts.
 */
const getCoverageRoleScore = (
	p: PlayerGameSim,
	concept: PassConcept,
): number | undefined => {
	if (concept === "DEEP_SHOT") {
		return maxDefined([
			p.roleOvrs?.CB_OUTSIDE,
			p.roleOvrs?.FS,
			p.roleOvrs?.SS,
		]);
	}

	if (concept === "QUICK_GAME") {
		return maxDefined([
			p.roleOvrs?.CB_SLOT,
			p.roleOvrs?.MIKE,
			p.roleOvrs?.WILL,
			p.roleOvrs?.SS,
			p.roleOvrs?.CB_OUTSIDE,
		]);
	}

	if (concept === "SCREEN") {
		return maxDefined([
			p.roleOvrs?.WILL,
			p.roleOvrs?.SAM,
			p.roleOvrs?.CB_SLOT,
			p.roleOvrs?.SS,
			p.roleOvrs?.MIKE,
		]);
	}

	if (concept === "PLAY_ACTION") {
		return maxDefined([
			p.roleOvrs?.FS,
			p.roleOvrs?.SS,
			p.roleOvrs?.MIKE,
			p.roleOvrs?.WILL,
			p.roleOvrs?.CB_OUTSIDE,
		]);
	}

	return maxDefined([
		p.roleOvrs?.CB_OUTSIDE,
		p.roleOvrs?.CB_SLOT,
		p.roleOvrs?.FS,
		p.roleOvrs?.SS,
		p.roleOvrs?.WILL,
	]);
};

export const getCoverageDefenderWeight = (
	p: PlayerGameSim,
	concept: PassConcept,
): number => {
	const roleScore =
		getCoverageRoleScore(
			p,
			concept,
		);

	const roleFactor =
		roleScore === undefined
			? 1
			: helpers.bound(
					0.75 +
						(roleScore / 100) *
							0.75,
					0.75,
					1.5,
				);

	const coverage =
		Math.max(
			0.05,
			p.compositeRating
				.passCoverage,
		);

	const tackling =
		Math.max(
			0.05,
			p.compositeRating
				.tackling,
		);

	const energy =
		helpers.bound(
			p.stat.energy ?? 1,
			0.25,
			1,
		);

	const skillWeight =
		concept === "SCREEN"
			? coverage * 0.55 +
				tackling * 0.45
			: coverage;

	return (
		skillWeight ** 2 *
		roleFactor *
		energy
	);
};

type BaseDefensiveFront =
	| "BASE_3_4"
	| "BASE_4_3";

const baseDefensiveFrontCache =
	new WeakMap<
		TeamGameSim,
		BaseDefensiveFront
	>();

const getDefensiveFrontFitScore = (
	team: TeamGameSim,
	front: BaseDefensiveFront,
): number => {
	let totalScore = 0;

	for (
		const pos of
			["DL", "LB"] as const
	) {
		const roles =
			DEFENSIVE_ROLES_BY_FRONT[
				front
			][pos];

		const depth =
			team.depth[pos];

		if (
			roles === undefined ||
			depth === undefined ||
			depth.length <
				roles.length
		) {
			return -Infinity;
		}

		const orderedDepth =
			getRoleBasedDepth(
				depth,
				roles,
			);

		for (
			let i = 0;
			i < roles.length;
			i++
		) {
			const role =
				roles[i]!;

			const p =
				orderedDepth[i];

			const score =
				p?.roleOvrs?.[
					role
				];

			if (
				score ===
				undefined
			) {
				return -Infinity;
			}

			totalScore +=
				score;
		}
	}

	return totalScore;
};

export const getBaseDefensiveFront = (
	team: TeamGameSim,
): BaseDefensiveFront => {
	const cached =
		baseDefensiveFrontCache.get(
			team,
		);

	if (cached) {
		return cached;
	}

	const score34 =
		getDefensiveFrontFitScore(
			team,
			"BASE_3_4",
		);

	const score43 =
		getDefensiveFrontFitScore(
			team,
			"BASE_4_3",
		);

	const front:
		BaseDefensiveFront =
			score34 > score43
				? "BASE_3_4"
				: "BASE_4_3";

	baseDefensiveFrontCache.set(
		team,
		front,
	);

	return front;
};

export const getFormationDepth = (
	depth: PlayerGameSim[],
	formation: Formation,
	side: "off" | "def",
	pos: Position,
): PlayerGameSim[] => {
	const roles =
		side === "off"
			? getOffensiveRoleOrder(
					formation,
					pos,
				)
			: getDefensiveRoleOrder(
					formation,
					pos,
				);

	if (
		roles === undefined ||
		roles.length === 0
	) {
		return depth;
	}

	return getRoleBasedDepth(
		depth,
		roles,
	);
};

const getPlayers = (
	playersOnField: PlayersOnField,
	positions: Position[] = POSITIONS,
): PlayerGameSim[] => {
	const players:
		PlayerGameSim[] = [];

	for (
		const pos of
			helpers.keys(
				playersOnField,
			)
	) {
		if (
			positions.includes(
				pos,
			) &&
			playersOnField[pos]
		) {
			players.push(
				...playersOnField[
					pos
				],
			);
		}
	}

	return players;
};

export default getPlayers;