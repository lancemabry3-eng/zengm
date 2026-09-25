import { FATIGUE_POS } from "../../common/constants.football.ts";
import { choice, randInt, truncGauss } from "../../common/random.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { g, helpers } from "../util/index.ts";
import GameSimBaseball from "./GameSim.baseball/index.ts";
import GameSimBasketball from "./GameSim.basketball/index.ts";
import formations from "./GameSim.football/formations.ts";
import {
	getBaseDefensiveFront,
	getFormationDepth,
	getOffensivePersonnelFit,
} from "./GameSim.football/getPlayers.ts";
import GameSimFootball from "./GameSim.football/index.ts";
import type {
	Formation,
	OffensivePersonnel,
	PlayerGameSim,
	TeamGameSim,
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

const applyBaseDefensiveFront = (
	formation: Formation,
	defense: GameSimFootball["team"][number],
): Formation => {
	const defensiveFront =
		getBaseDefensiveFront(
			defense,
		);

	if (
		defensiveFront ===
		"BASE_3_4"
	) {
		return {
			...formation,
			defensiveFront,
			def: {
				DL: 3,
				LB: 4,
				CB: 2,
				S: 2,
			},
		};
	}

	return {
		...formation,
		defensiveFront,
		def: {
			DL: 4,
			LB: 3,
			CB: 2,
			S: 2,
		},
	};
};

const getNormalFormation = (
	formation: Formation,
	defense: GameSimFootball["team"][number],
): Formation => {
	if (
		formation
			.offensivePersonnel ===
		"11"
	) {
		return formation;
	}

	return applyBaseDefensiveFront(
		formation,
		defense,
	);
};

const getPersonnelSituationWeight = (
	personnel: OffensivePersonnel,
	playType: "run" | "pass",
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight: number;

	/*
	 * Base package tendencies.
	 *
	 * 11 is the primary passing package.
	 * 12 is balanced and flexible.
	 * 21 leans toward the run game.
	 * 22 is the heaviest specialty grouping.
	 */
	if (playType === "pass") {
		if (personnel === "11") {
			weight = 5.5;
		} else if (personnel === "12") {
			weight = 3.5;
		} else if (personnel === "21") {
			weight = 2.25;
		} else {
			weight = 0.75;
		}
	} else {
		if (personnel === "11") {
			weight = 2.5;
		} else if (personnel === "12") {
			weight = 3.5;
		} else if (personnel === "21") {
			weight = 4;
		} else {
			weight = 3;
		}
	}

	/*
	 * Short yardage invites heavier personnel.
	 *
	 * 12 gets a modest bump because the second TE adds
	 * blocking without sacrificing as much receiving threat
	 * as 21 or 22.
	 */
	if (toGo <= 2) {
		if (personnel === "11") {
			weight *= 0.75;
		} else if (personnel === "12") {
			weight *= 1.15;
		} else if (personnel === "21") {
			weight *= 1.25;
		} else {
			weight *= 1.6;
		}
	}

	/*
	 * Longer yardage pushes the offense toward spread skill
	 * personnel, but 12 can remain viable because its second
	 * TE may still be a legitimate receiver.
	 */
	if (toGo >= 7) {
		if (personnel === "11") {
			weight *= 1.55;
		} else if (personnel === "12") {
			weight *= 1.05;
		} else if (personnel === "21") {
			weight *= 0.8;
		} else {
			weight *= 0.55;
		}
	}

	/*
	 * Obvious passing downs lean further toward 11.
	 *
	 * 12 remains a useful changeup when a team has enough TE
	 * receiving talent to punish lighter defensive packages.
	 */
	if (
		down >= 3 &&
		toGo >= 5
	) {
		if (personnel === "11") {
			weight *= 1.5;
		} else if (personnel === "12") {
			weight *= 1.05;
		} else if (personnel === "21") {
			weight *= 0.75;
		} else {
			weight *= 0.45;
		}
	}

	/*
	 * Inside the opponent's five, power personnel becomes
	 * significantly more attractive.
	 *
	 * 12 receives a meaningful bump while still remaining the
	 * most balanced heavy-ish package.
	 */
	if (scrimmage >= 95) {
		if (personnel === "11") {
			weight *= 0.7;
		} else if (personnel === "12") {
			weight *= 1.2;
		} else if (personnel === "21") {
			weight *= 1.25;
		} else {
			weight *= 1.75;
		}
	}

	return weight;
};

const chooseOffensiveFormation = (
	offense: TeamGameSim,
	playType: "run" | "pass",
	down: number,
	toGo: number,
	scrimmage: number,
): Formation => {
	const fits = new Map<
		OffensivePersonnel,
		number
	>();

	for (const formation of formations.normal) {
		const personnel =
			formation.offensivePersonnel;

		if (personnel === undefined) {
			continue;
		}

		const fit =
			getOffensivePersonnelFit(
				offense,
				personnel,
			);

		if (fit !== undefined) {
			fits.set(
				personnel,
				fit,
			);
		}
	}

	let averageFit:
		| number
		| undefined;

	if (fits.size > 0) {
		let total = 0;

		for (const fit of fits.values()) {
			total += fit;
		}

		averageFit =
			total / fits.size;
	}

	return choice(
		formations.normal,
		(formation) => {
			const personnel =
				formation
					.offensivePersonnel;

			if (personnel === undefined) {
				return 0.01;
			}

			const situationWeight =
				getPersonnelSituationWeight(
					personnel,
					playType,
					down,
					toGo,
					scrimmage,
				);

			const fit =
				fits.get(
					personnel,
				);

			const fitFactor =
				fit !== undefined &&
				averageFit !== undefined
					? helpers.bound(
							1 +
								(fit -
									averageFit) /
									50,
							0.7,
							1.3,
						)
					: 1;

			return (
				situationWeight *
				fitFactor
			);
		},
	);
};

/*
 * Football realism layer.
 *
 * The base Football GameSim still handles the entire game.
 * This subclass replaces formation/player selection so
 * functional roles, personnel packages, and defensive
 * schemes can influence who actually takes the field.
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
			playType === "starters"
		) {
			/*
			 * Record defensive starters from the team's actual
			 * base front rather than treating nickel as its
			 * permanent starting defense.
			 *
			 * Offense still uses the existing 11-personnel
			 * starter grouping.
			 */
			formation =
				applyBaseDefensiveFront(
					formations.normal[
						0
					]!,
					this.team[
						this.d
					],
				);
		} else if (
			playType ===
			"startersFake"
		) {
			/*
			 * probPass() uses this synthetic look to compare
			 * pass/run talent. Keep the existing 11-personnel
			 * versus nickel baseline for that calculation.
			 */
			formation =
				formations.normal[0]!;
		} else if (
			playType === "run" ||
			playType === "pass"
		) {
			const offensiveFormation =
				chooseOffensiveFormation(
					this.team[
						this.o
					],
					playType,
					this.down,
					this.toGo,
					this.scrimmage,
				);

			/*
			 * 11 personnel forces the defense into nickel.
			 *
			 * 12, 21, and 22 personnel are answered by the
			 * defense's own inferred base 3-4 or 4-3 scheme.
			 */
			formation =
				getNormalFormation(
					offensiveFormation,
					this.team[
						this.d
					],
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

				const FATIGUE_MODIFIER =
					pos === "WR"
						? 0.75
						: 1;

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