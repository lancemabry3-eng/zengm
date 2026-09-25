import { POSITIONS } from "../../../common/constants.football.ts";
import type { Position } from "../../../common/types.football.ts";
import helpers from "../../util/helpers.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import type { PlayerGameSim, PlayersOnField } from "./types.ts";

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
		return depth;
	}

	const rolePlayerIds =
		new Set(
			bestPlayers.map(
				(p) => p.id,
			),
		);

	return [
		...bestPlayers,
		...depth.filter(
			(p) =>
				!rolePlayerIds.has(
					p.id,
				),
		),
	];
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