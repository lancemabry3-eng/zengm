import { FATIGUE_POS } from "../../common/constants.football.ts";
import { choice, randInt, truncGauss } from "../../common/random.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { g, helpers } from "../util/index.ts";
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

	doPass() {
		const o = this.o;
		const d = this.d;

		this.updatePlayersOnField("pass");

		const penInfo =
			this.checkPenalties(
				"beforeSnap",
			);

		if (penInfo) {
			return 0;
		}

		const pbw = new Map<
			PlayerGameSim,
			{
				type:
					| "OL"
					| "Other";
				won: boolean;
			}
		>();

		const pbCounts = {
			aOL: 0,
			aOther: 0,
			wOL: 0,
			wOther: 0,
		};

		const addBlockAttempt = (
			p: PlayerGameSim,
			type:
				| "OL"
				| "Other",
			baselineRatio: number,
		) => {
			const ratio =
				p.compositeRating
					.passBlocking /
				this.team[d]
					.compositeRating
					.passRushing;

			const probWin =
				helpers.bound(
					(ratio -
						baselineRatio) *
						(0.45 /
							0.25) +
						0.5,
					0,
					0.96,
				);

			const won =
				Math.random() <
				probWin;

			pbw.set(
				p,
				{
					type,
					won,
				},
			);

			pbCounts[
				`a${type}`
			] += 1;

			if (won) {
				pbCounts[
					`w${type}`
				] += 1;
			}
		};

		/*
		 * OL always block.
		 *
		 * TE and RB may stay in protection.
		 *
		 * The five OL entries remain ordered:
		 *
		 * LT
		 * LG
		 * C
		 * RG
		 * RT
		 */
		const ol =
			this.playersOnField[
				o
			].OL;

		if (ol) {
			const passBlockBaselines = [
				1.03,
				0.99,
				0.98,
				0.99,
				1.02,
			];

			for (
				let i = 0;
				i < ol.length;
				i++
			) {
				addBlockAttempt(
					ol[i]!,
					"OL",
					passBlockBaselines[
						i
					] ?? 1,
				);
			}
		}

		/*
		 * Restore TE pass protection.
		 *
		 * Each TE has a 10% chance to remain in protection.
		 */
		const te =
			this.playersOnField[
				o
			].TE;

		if (te) {
			for (const p of te) {
				if (
					Math.random() <
					0.1
				) {
					addBlockAttempt(
						p,
						"Other",
						0.75,
					);
				}
			}
		}

		const rb =
			this.playersOnField[
				o
			].RB;

		if (rb) {
			for (const p of rb) {
				if (
					Math.random() <
					0.5
				) {
					addBlockAttempt(
						p,
						"Other",
						0.5,
					);
				}
			}
		}

		const qb =
			this.getTopPlayerOnField(
				o,
				"QB",
			);

		this.currentPlay.addEvent(
			{
				type: "dropback",
				pbw,
			},
		);

		this.playByPlay.logEvent(
			{
				type: "dropback",
				clock:
					this.clock,
				names: [
					qb.name,
				],
				t: o,
			},
		);

		let dt =
			randInt(
				2,
				6,
			);

		if (
			Math.random() <
				0.75 &&
			Math.random() <
				this.probFumble(
					qb,
				)
		) {
			const yds =
				this.currentPlay.boundedYds(
					randInt(
						-1,
						-10,
					),
				);

			return (
				dt +
				this.doFumble(
					qb,
					yds,
				)
			);
		}

		const sack =
			Math.random() <
			this.probSack(
				qb,
				pbw,
			);

		if (sack) {
			return this.doSack(
				qb,
				pbw,
			);
		}

		if (
			this.probScramble(
				this.playersOnField[
					o
				].QB?.[0],
			) >
			Math.random()
		) {
			return this.doRun(
				true,
			);
		}

		const target =
			this.pickPlayer(
				o,
				Math.random() <
					0.2
					? "catching"
					: "gettingOpen",
				[
					"WR",
					"TE",
					"RB",
				],
				1.5,
			);

		const rbFactor =
			this.playersOnField[
				o
			].RB?.includes(
				target,
			) &&
			Math.random() <
				0.75
				? target
						.compositeRating
						.gettingOpen
				: 1;

		let ydsRaw =
			Math.round(
				truncGauss(
					helpers.bound(
						rbFactor *
							8.6 *
							(
								this
									.team[
									o
								]
									.compositeRating
									.passBlocking /
								this
									.team[
									d
								]
									.compositeRating
									.passRushing
							),
						-5,
						100,
					),
					rbFactor *
						7,
					-5,
					100,
				),
			);

		if (
			Math.random() <
			qb.compositeRating
				.passingDeep *
				0.05
		) {
			ydsRaw +=
				randInt(
					0,
					109,
				);
		}

		ydsRaw +=
			Math.round(
				(
					target
						.compositeRating
						.speed -
					0.5
				) *
					6,
			);

		if (
			Math.random() <
			target.compositeRating
				.speed *
				0.025
		) {
			ydsRaw +=
				randInt(
					0,
					109,
				);
		}

		if (ydsRaw < 0) {
			ydsRaw +=
				randInt(
					0,
					5,
				);
		}

		ydsRaw =
			Math.round(
				ydsRaw *
					g.get(
						"passYdsFactor",
					),
			);

		const yds =
			this.currentPlay.boundedYds(
				ydsRaw,
			);

		const defender =
			this.pickPlayer(
				d,
				"passCoverage",
				undefined,
				2,
			);

		const complete =
			Math.random() <
			this.probComplete(
				qb,
				target,
				defender,
			);

		const interception =
			Math.random() <
			this.probInt(
				qb,
				defender,
			);

		this.checkPenalties(
			"pass",
			{
				ballCarrier:
					target,
				playYds:
					yds,
				incompletePass:
					!complete &&
					!interception,
			},
		);

		this.currentPlay.addEvent(
			{
				type: "pss",
				qb,
				target,
			},
		);

		if (interception) {
			dt +=
				this.doInterception(
					qb,
					yds,
					defender,
				);
		} else {
			dt +=
				Math.abs(
					yds,
				) / 20;

			if (complete) {
				const {
					td,
					safety,
				} =
					this.currentPlay.addEvent(
						{
							type:
								"pssCmp",
							qb,
							target,
							yds,
						},
					);

				const completeEvent = {
					type:
						"passComplete" as const,
					clock:
						this.clock,
					names: [
						qb.name,
						target.name,
					],
					safety,
					t: o,
					td,
					twoPointConversionTeam:
						this
							.twoPointConversionTeam,
					yds,
				};

				if (
					!td &&
					!safety
				) {
					if (
						Math.random() <
						this.probFumble(
							target,
						)
					) {
						this.playByPlay.logEvent(
							{
								totalPssTD:
									undefined,
								totalRecTD:
									undefined,
								...completeEvent,
							},
						);

						return (
							dt +
							this.doFumble(
								target,
								0,
							)
						);
					}
				}

				if (td) {
					this.currentPlay.addEvent(
						{
							type:
								"pssTD",
							qb,
							target,
						},
					);
				}

				if (safety) {
					this.doSafety();
				}

				this.playByPlay.logEvent(
					{
						totalPssTD:
							this
								.allStarGame
								? undefined
								: qb
										.seasonStats[
										"pssTD"
									] +
									qb
										.stat[
										"pssTD"
									],
						totalRecTD:
							this
								.allStarGame
								? undefined
								: target
										.seasonStats[
										"recTD"
									] +
									target
										.stat[
										"recTD"
									],
						...completeEvent,
					},
				);

				if (
					!td &&
					!safety
				) {
					this.doTackle(
						{
							ydsFromScrimmage:
								yds,
						},
					);
				}
			} else {
				this.currentPlay.addEvent(
					{
						type:
							"pssInc",
						defender:
							Math.random() <
							0.28
								? defender
								: undefined,
					},
				);

				this.playByPlay.logEvent(
					{
						type:
							"passIncomplete",
						clock:
							this.clock,
						names: [
							qb.name,
							target.name,
						],
						t: o,
						yds,
					},
				);
			}
		}

		return dt;
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
	football:
		GameSimFootballRealism,
	hockey: GameSimHockey,
});

export default GameSim;