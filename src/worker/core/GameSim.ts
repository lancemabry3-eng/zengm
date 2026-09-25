import { FATIGUE_POS } from "../../common/constants.football.ts";
import { choice } from "../../common/random.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { helpers } from "../util/index.ts";
import GameSimBaseball from "./GameSim.baseball/index.ts";
import GameSimBasketball from "./GameSim.basketball/index.ts";
import formations from "./GameSim.football/formations.ts";
import {
	getFormationDepth,
} from "./GameSim.football/getPlayers.ts";
import GameSimFootball from "./GameSim.football/index.ts";
import type {
	Formation,
	PlayerGameSim,
} from "./GameSim.football/types.ts";
import GameSimHockey from "./GameSim.hockey/index.ts";

const footballFatigue = (
	energy: number,
	injured: boolean,
): number => {
	if (injured) {
		return 0;
	}

	energy += 0.05;

	if (energy > 1) {
		energy = 1;
	}

	return energy;
};

/*
 * Football realism layer.
 *
 * The base Football GameSim still handles the entire game.
 * This subclass only replaces player selection so defensive
 * formations can use functional-role depth orders.
 *
 * Everything else continues to come from the existing
 * Football GameSim implementation.
 */
class GameSimFootballRealism extends GameSimFootball {
	updatePlayersOnField(
		playType:
			| "starters"
			| "startersFake"
			| "run"
			| "pass"
			| "extraPoint"
			| "fieldGoal"
			| "punt"
			| "kickoff",
	) {
		let formation: Formation;

		if (
			playType === "starters" ||
			playType === "startersFake"
		) {
			formation =
				formations.normal[0]!;
		} else if (
			playType === "run" ||
			playType === "pass"
		) {
			formation =
				choice(
					formations.normal,
				);
		} else if (
			playType === "extraPoint" ||
			playType === "fieldGoal"
		) {
			formation =
				choice(
					formations.fieldGoal,
				);
		} else if (
			playType === "punt"
		) {
			formation =
				choice(
					formations.punt,
				);
		} else if (
			playType === "kickoff"
		) {
			formation =
				choice(
					formations.kickoff,
				);
		} else {
			throw new Error(
				`Unknown playType "${playType}"`,
			);
		}

		const sides = [
			"off",
			"def",
		] as const;

		for (
			const i of
				[0, 1] as const
		) {
			const t =
				i === 0
					? this.o
					: this.d;

			const side =
				sides[i];

			/*
			 * Don't let one player be used at two positions
			 * on the same side of the ball.
			 */
			const pidsUsed =
				new Set<number>();

			this.playersOnField[t] =
				{};

			for (
				const pos of
					helpers.keys(
						formation[
							side
						],
					)
			) {
				const numPlayers =
					formation[
						side
					][pos]!;

				/*
				 * Preserve the existing WR fatigue behavior.
				 */
				const FATIGUE_MODIFIER =
					pos === "WR"
						? 0.75
						: 1;

				/*
				 * Offense and special teams receive the normal
				 * depth chart.
				 *
				 * Normal defensive formations receive a cached,
				 * front-specific functional-role ordering.
				 */
				const depth =
					getFormationDepth(
						this.team[t]
							.depth[
							pos
						],
						formation,
						side,
						pos,
					);

				const players:
					PlayerGameSim[] =
						[];

				/*
				 * Preserve the five offensive line slots:
				 *
				 * LT
				 * LG
				 * C
				 * RG
				 * RT
				 *
				 * An injured starter is replaced without
				 * collapsing the rest of the line inward.
				 */
				if (
					pos === "OL" &&
					numPlayers === 5 &&
					depth.length >= 5
				) {
					const getOlBackup = (
						healthyOnly:
							boolean,
					) => {
						for (
							let depthIndex =
								5;
							depthIndex <
							depth.length;
							depthIndex++
						) {
							const p =
								depth[
									depthIndex
								]!;

							if (
								pidsUsed.has(
									p.id,
								)
							) {
								continue;
							}

							if (
								healthyOnly &&
								p.injured
							) {
								continue;
							}

							return p;
						}
					};

					for (
						let slotIndex =
							0;
						slotIndex <
						5;
						slotIndex++
					) {
						const starter =
							depth[
								slotIndex
							]!;

						let p:
							| PlayerGameSim
							| undefined;

						if (
							!starter.injured &&
							!pidsUsed.has(
								starter.id,
							)
						) {
							p =
								starter;
						} else {
							p =
								getOlBackup(
									true,
								);
						}

						/*
						 * If no healthy backup is available,
						 * preserve the starter's assigned slot
						 * before considering another injured
						 * backup.
						 */
						if (
							!p &&
							!pidsUsed.has(
								starter.id,
							)
						) {
							p =
								starter;
						}

						if (!p) {
							p =
								getOlBackup(
									false,
								);
						}

						if (p) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				} else if (
					FATIGUE_POS.has(
						pos,
					)
				) {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						const p =
							depth[
								depthIndex
							]!;

						if (
							p.injured ||
							pidsUsed.has(
								p.id,
							)
						) {
							continue;
						}

						if (
							Math.random() <
							FATIGUE_MODIFIER *
								footballFatigue(
									p.stat
										.energy,
									p.injured,
								)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				} else {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						const p =
							depth[
								depthIndex
							]!;

						if (
							!p.injured &&
							!pidsUsed.has(
								p.id,
							)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				}

				this.playersOnField[
					t
				][pos] = players;

				/*
				 * Retry without ignoring fatigued players.
				 */
				if (
					players.length <
					numPlayers
				) {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						const p =
							depth[
								depthIndex
							]!;

						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						if (
							!p.injured &&
							!pidsUsed.has(
								p.id,
							)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}

					/*
					 * Last resort: allow injured players.
					 */
					if (
						players.length <
						numPlayers
					) {
						for (
							let depthIndex =
								0;
							depthIndex <
							depth.length;
							depthIndex++
						) {
							const p =
								depth[
									depthIndex
								]!;

							if (
								players.length >=
								numPlayers
							) {
								break;
							}

							if (
								!pidsUsed.has(
									p.id,
								)
							) {
								players.push(
									p,
								);

								pidsUsed.add(
									p.id,
								);
							}
						}
					}
				}

				for (
					const p of
						this
							.playersOnField[
							t
						][pos]
				) {
					if (
						playType ===
						"starters"
					) {
						this.recordStat(
							t,
							p,
							"gs",
						);
					}

					this.recordStat(
						t,
						p,
						"gp",
					);
				}
			}
		}

		this.updateTeamCompositeRatings();
	}
}

const GameSim = bySport<
	| typeof GameSimBaseball
	| typeof GameSimFootballRealism
	| typeof GameSimBasketball
	| typeof GameSimHockey
>({
	baseball: GameSimBaseball,
	basketball: GameSimBasketball,
	football: GameSimFootballRealism,
	hockey: GameSimHockey,
});

export default GameSim;