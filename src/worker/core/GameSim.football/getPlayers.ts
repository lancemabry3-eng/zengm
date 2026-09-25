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

	/*
	 * If a complete role assignment cannot be made,
	 * preserve the existing depth chart.
	 */
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

/*
 * Score how naturally a roster fits one offensive personnel
 * package.
 *
 * All current normal personnel packages contain five RB/WR/TE
 * skill players, so averaging their assigned functional-role
 * scores makes the packages directly comparable.
 *
 * An undefined result means the game-sim player objects do not
 * contain enough functional-role data. Callers can then fall
 * back to neutral package weighting for compatibility.
 */
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

/*
 * Infer a team's preferred base defensive front from the
 * functional-role talent available in its front seven.
 *
 * Both candidate fronts use seven defenders, so their
 * aggregate role-fit scores are directly comparable.
 *
 * The result is cached for the entire game.
 *
 * Injuries can change who actually plays, but they do not
 * cause the defense to reinvent its base scheme every snap.
 *
 * Coaching preferences can override this later when the
 * coaching system is implemented.
 */
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

/*
 * Return the appropriate positional depth chart for a
 * specific formation.
 *
 * Normal offensive formations use the functional role
 * blueprint associated with their personnel package.
 *
 * Normal defensive formations use the functional role
 * blueprint associated with their defensive front.
 *
 * Special-teams formations do not define either identifier,
 * so they naturally retain their normal depth order.
 */
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