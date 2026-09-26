import { assert, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g, helpers } from "../../util/index.ts";
import RealismGameSim from "../GameSim.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import BaseGameSim from "./index.ts";

const FootballRealismGameSim =
	RealismGameSim as any;

const NUM_ROSTER_SETS = 5;
const GAMES_PER_SET = 20;

type Totals = {
	points: number;
	passAttempts: number;
	passCompletions: number;
	passYards: number;
	passTouchdowns: number;
	interceptions: number;
	sacks: number;
	rushAttempts: number;
	rushYards: number;
	rushTouchdowns: number;
	fumblesLost: number;
};

const makeTotals = (): Totals => ({
	points: 0,
	passAttempts: 0,
	passCompletions: 0,
	passYards: 0,
	passTouchdowns: 0,
	interceptions: 0,
	sacks: 0,
	rushAttempts: 0,
	rushYards: 0,
	rushTouchdowns: 0,
	fumblesLost: 0,
});

const round = (
	value: number,
) =>
	Math.round(
		value * 1000,
	) / 1000;

const genTwoTeams = async () => {
	resetG();

	g.setWithoutSavingToDB(
		"season",
		2013,
	);

	const teamsDefault =
		helpers
			.getTeamsDefault()
			.slice(0, 2);

	await resetCache({
		players: [
			...range(50).map(() =>
				player.generate(
					0,
					25,
					2010,
					true,
					DEFAULT_LEVEL,
				),
			),
			...range(50).map(() =>
				player.generate(
					1,
					25,
					2010,
					true,
					DEFAULT_LEVEL,
				),
			),
		],

		teams:
			teamsDefault.map(
				team.generate,
			),

		teamSeasons:
			teamsDefault.map(
				(t) =>
					team.genSeasonRow(
						t,
					),
			),

		teamStats:
			teamsDefault.map(
				(t) =>
					team.genStatsRow(
						t.tid,
					),
			),
	});
};

const prepareTeams = async () => {
	const teams =
		await loadTeams(
			[0, 1],
			{},
		);

	for (
		const t of [
			teams[0],
			teams[1],
		]
	) {
		if (
			t.depth !==
			undefined
		) {
			t.depth =
				team.getDepthPlayers(
					t.depth,
					t.player,
				);
		}
	}

	return [
		teams[0],
		teams[1],
	] as any;
};

const initBaseGame = async (
	gid: number,
) => {
	const teams =
		await prepareTeams();

	return new BaseGameSim({
		gid,
		teams,
		baseInjuryRate:
			g.get(
				"injuryRate",
			),
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: false,
	});
};

const initRealismGame = async (
	gid: number,
) => {
	const teams =
		await prepareTeams();

	return new FootballRealismGameSim({
		gid,
		teams,
		baseInjuryRate:
			g.get(
				"injuryRate",
			),
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: false,
	}) as any;
};

const recordResult = (
	totals: Totals,
	result: any,
) => {
	for (
		const t of result.team
	) {
		const stat =
			t.stat;

		totals.points +=
			stat.pts ?? 0;

		totals.passAttempts +=
			stat.pss ?? 0;

		totals.passCompletions +=
			stat.pssCmp ?? 0;

		totals.passYards +=
			stat.pssYds ?? 0;

		totals.passTouchdowns +=
			stat.pssTD ?? 0;

		totals.interceptions +=
			stat.pssInt ?? 0;

		totals.sacks +=
			stat.pssSk ?? 0;

		totals.rushAttempts +=
			stat.rus ?? 0;

		totals.rushYards +=
			stat.rusYds ?? 0;

		totals.rushTouchdowns +=
			stat.rusTD ?? 0;

		totals.fumblesLost +=
			stat.fmbLost ?? 0;
	}
};

const summarize = (
	totals: Totals,
	teamGames: number,
) => {
	const dropbacks =
		totals.passAttempts +
		totals.sacks;

	const offensivePlays =
		dropbacks +
		totals.rushAttempts;

	return {
		pointsPerTeamGame:
			round(
				totals.points /
					teamGames,
			),

		passAttemptsPerTeamGame:
			round(
				totals.passAttempts /
					teamGames,
			),

		completionPct:
			round(
				totals.passCompletions /
					totals.passAttempts,
			),

		passYardsPerTeamGame:
			round(
				totals.passYards /
					teamGames,
			),

		passYardsPerAttempt:
			round(
				totals.passYards /
					totals.passAttempts,
			),

		passTouchdownsPerTeamGame:
			round(
				totals.passTouchdowns /
					teamGames,
			),

		interceptionsPerTeamGame:
			round(
				totals.interceptions /
					teamGames,
			),

		interceptionRate:
			round(
				totals.interceptions /
					totals.passAttempts,
			),

		sacksPerTeamGame:
			round(
				totals.sacks /
					teamGames,
			),

		sackRate:
			round(
				totals.sacks /
					dropbacks,
			),

		rushAttemptsPerTeamGame:
			round(
				totals.rushAttempts /
					teamGames,
			),

		rushYardsPerTeamGame:
			round(
				totals.rushYards /
					teamGames,
			),

		rushYardsPerAttempt:
			round(
				totals.rushYards /
					totals.rushAttempts,
			),

		rushTouchdownsPerTeamGame:
			round(
				totals.rushTouchdowns /
					teamGames,
			),

		fumblesLostPerTeamGame:
			round(
				totals.fumblesLost /
					teamGames,
			),

		turnoversPerTeamGame:
			round(
				(
					totals.interceptions +
					totals.fumblesLost
				) /
					teamGames,
			),

		offensivePlaysPerTeamGame:
			round(
				offensivePlays /
					teamGames,
			),

		passRate:
			round(
				dropbacks /
					offensivePlays,
			),
	};
};

test(
	"paired base and realism football statistical validation",
	async () => {
		const baseTotals =
			makeTotals();

		const realismTotals =
			makeTotals();

		let gid = 10_000;

		for (
			let rosterSet = 0;
			rosterSet <
			NUM_ROSTER_SETS;
			rosterSet++
		) {
			await genTwoTeams();

			for (
				let gameIndex = 0;
				gameIndex <
				GAMES_PER_SET;
				gameIndex++
			) {
				const baseGame =
					await initBaseGame(
						gid,
					);

				const baseResult =
					baseGame.run();

				recordResult(
					baseTotals,
					baseResult,
				);

				const realismGame =
					await initRealismGame(
						gid + 1,
					);

				const realismResult =
					realismGame.run();

				recordResult(
					realismTotals,
					realismResult,
				);

				gid += 2;
			}
		}

		const games =
			NUM_ROSTER_SETS *
			GAMES_PER_SET;

		const teamGames =
			games * 2;

		const baseline =
			summarize(
				baseTotals,
				teamGames,
			);

		const realism =
			summarize(
				realismTotals,
				teamGames,
			);

		const delta = {
			pointsPerTeamGame:
				round(
					realism
						.pointsPerTeamGame -
						baseline
							.pointsPerTeamGame,
				),

			completionPct:
				round(
					realism
						.completionPct -
						baseline
							.completionPct,
				),

			passYardsPerAttempt:
				round(
					realism
						.passYardsPerAttempt -
						baseline
							.passYardsPerAttempt,
				),

			interceptionRate:
				round(
					realism
						.interceptionRate -
						baseline
							.interceptionRate,
				),

			sackRate:
				round(
					realism
						.sackRate -
						baseline
							.sackRate,
				),

			rushYardsPerAttempt:
				round(
					realism
						.rushYardsPerAttempt -
						baseline
							.rushYardsPerAttempt,
				),

			turnoversPerTeamGame:
				round(
					realism
						.turnoversPerTeamGame -
						baseline
							.turnoversPerTeamGame,
				),

			passRate:
				round(
					realism
						.passRate -
						baseline
							.passRate,
				),
		};

		console.log(
			"FOOTBALL_PAIRED_VALIDATION",
			JSON.stringify({
				rosterSets:
					NUM_ROSTER_SETS,

				gamesPerEngine:
					games,

				teamGamesPerEngine:
					teamGames,

				baseline,

				realism,

				delta,
			}),
		);

		assert(
			Number.isFinite(
				baseline
					.pointsPerTeamGame,
			),
		);

		assert(
			Number.isFinite(
				realism
					.pointsPerTeamGame,
			),
		);

		assert(
			Number.isFinite(
				delta
					.rushYardsPerAttempt,
			),
		);
	},
	120_000,
);