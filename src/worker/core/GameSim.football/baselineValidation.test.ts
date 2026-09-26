import { assert, beforeAll, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g, helpers } from "../../util/index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import GameSim from "./index.ts";

const NUM_GAMES = 100;

const round = (value: number) =>
	Math.round(value * 1000) / 1000;

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
			teamsDefault.map((t) =>
				team.genSeasonRow(t),
			),
		teamStats:
			teamsDefault.map((t) =>
				team.genStatsRow(
					t.tid,
				),
			),
	});
};

const initGame = async (
	gid: number,
) => {
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

	return new GameSim({
		gid,
		teams: [
			teams[0],
			teams[1],
		],
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

beforeAll(async () => {
	await genTwoTeams();
});

test(
	"base football engine statistical control sample",
	async () => {
		const TEAM_GAMES =
			NUM_GAMES * 2;

		let points = 0;

		let passAttempts = 0;
		let passCompletions = 0;
		let passYards = 0;
		let passTouchdowns = 0;
		let interceptions = 0;
		let sacks = 0;

		let rushAttempts = 0;
		let rushYards = 0;
		let rushTouchdowns = 0;

		let fumblesLost = 0;

		for (
			let i = 0;
			i < NUM_GAMES;
			i++
		) {
			const game =
				await initGame(
					5000 + i,
				);

			const result =
				game.run();

			for (
				const t of
					result.team
			) {
				const stat =
					t.stat;

				points +=
					stat.pts ?? 0;

				passAttempts +=
					stat.pss ?? 0;

				passCompletions +=
					stat.pssCmp ?? 0;

				passYards +=
					stat.pssYds ?? 0;

				passTouchdowns +=
					stat.pssTD ?? 0;

				interceptions +=
					stat.pssInt ?? 0;

				sacks +=
					stat.pssSk ?? 0;

				rushAttempts +=
					stat.rus ?? 0;

				rushYards +=
					stat.rusYds ?? 0;

				rushTouchdowns +=
					stat.rusTD ?? 0;

				fumblesLost +=
					stat.fmbLost ?? 0;
			}
		}

		const dropbacks =
			passAttempts +
			sacks;

		const offensivePlays =
			dropbacks +
			rushAttempts;

		const summary = {
			games:
				NUM_GAMES,

			teamGames:
				TEAM_GAMES,

			pointsPerTeamGame:
				round(
					points /
						TEAM_GAMES,
				),

			passAttemptsPerTeamGame:
				round(
					passAttempts /
						TEAM_GAMES,
				),

			completionPct:
				round(
					passCompletions /
						passAttempts,
				),

			passYardsPerTeamGame:
				round(
					passYards /
						TEAM_GAMES,
				),

			passYardsPerAttempt:
				round(
					passYards /
						passAttempts,
				),

			passTouchdownsPerTeamGame:
				round(
					passTouchdowns /
						TEAM_GAMES,
				),

			interceptionsPerTeamGame:
				round(
					interceptions /
						TEAM_GAMES,
				),

			interceptionRate:
				round(
					interceptions /
						passAttempts,
				),

			sacksPerTeamGame:
				round(
					sacks /
						TEAM_GAMES,
				),

			sackRate:
				round(
					sacks /
						dropbacks,
				),

			rushAttemptsPerTeamGame:
				round(
					rushAttempts /
						TEAM_GAMES,
				),

			rushYardsPerTeamGame:
				round(
					rushYards /
						TEAM_GAMES,
				),

			rushYardsPerAttempt:
				round(
					rushYards /
						rushAttempts,
				),

			rushTouchdownsPerTeamGame:
				round(
					rushTouchdowns /
						TEAM_GAMES,
				),

			fumblesLostPerTeamGame:
				round(
					fumblesLost /
						TEAM_GAMES,
				),

			turnoversPerTeamGame:
				round(
					(
						interceptions +
						fumblesLost
					) /
						TEAM_GAMES,
				),

			offensivePlaysPerTeamGame:
				round(
					offensivePlays /
						TEAM_GAMES,
				),

			passRate:
				round(
					dropbacks /
						offensivePlays,
				),
		};

		console.log(
			"FOOTBALL_BASELINE_VALIDATION",
			JSON.stringify(
				summary,
			),
		);

		assert(
			Number.isFinite(
				summary
					.pointsPerTeamGame,
			),
		);

		assert(
			Number.isFinite(
				summary
					.completionPct,
			),
		);

		assert(
			Number.isFinite(
				summary
					.rushYardsPerAttempt,
			),
		);
	},
	60_000,
);