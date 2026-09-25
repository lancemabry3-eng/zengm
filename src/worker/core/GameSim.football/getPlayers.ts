import { POSITIONS } from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";
import helpers from "../../util/helpers.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import { getDefensiveRoleOrder } from "./formations.ts";
import type {
	Formation,
	PlayerGameSim,
	PlayersOnField,
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

/*
 * Return the appropriate positional depth chart for a
 * specific formation.
 *
 * Offense and special teams retain their normal depth order.
 *
 * Normal defensive formations use the functional role
 * blueprint associated with their defensive front.
 */
export const getFormationDepth = (
	depth: PlayerGameSim[],
	formation: Formation,
	side: "off" | "def",
	pos: Position,
): PlayerGameSim[] => {
	if (side !== "def") {
		return depth;
	}

	const roles =
		getDefensiveRoleOrder(
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