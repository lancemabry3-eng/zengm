import { assert, beforeAll, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g, helpers } from "../../util/index.ts";
import GameSim from "../GameSim.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";

const FootballGameSim = GameSim as any;

const genTwoTeams = async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2013);

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);

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
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) =>
			team.genSeasonRow(t),
		),
		teamStats: teamsDefault.map((t) =>
			team.genStatsRow(t.tid),
		),
	});
};

const initRealismGame = async (gid: number) => {
	const teams = await loadTeams([0, 1], {});

	for (const t of [teams[0], teams[1]]) {
		if (t.depth !== undefined) {
			t.depth = team.getDepthPlayers(
				t.depth,
				t.player,
			);
		}
	}

	return new FootballGameSim({
		gid,
		teams: [teams[0], teams[1]],
		baseInjuryRate: g.get("injuryRate"),
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: false,
	}) as any;
};

const round = (value: number) =>
	Math.round(value * 1000) / 1000;

beforeAll(async () => {
	await genTwoTeams();
});

test("football realism wrapper loads and completes games", async () => {
	const conceptGame = await initRealismGame(0);

	assert(
		"currentPassPressureLevel" in conceptGame,
	);

	assert.strictEqual(
		typeof conceptGame.team[0].coachingLevel,
		"number",
	);

	const playerWithRoleRatings =
		conceptGame.team[0].player.find(
			(p: any) =>
				p.roleOvrs !== undefined &&
				Object.keys(p.roleOvrs).length > 0,
		);

	assert(playerWithRoleRatings);

	conceptGame.updatePlayersOnField("run");

	assert.strictEqual(
		conceptGame.currentOffensivePlayConcept?.type,
		"run",
	);

	assert.notStrictEqual(
		conceptGame.currentDefensivePlayConcept,
		undefined,
	);

	for (let i = 0; i < 3; i++) {
		const game = await initRealismGame(i + 1);
		const result = game.run();

		assert.strictEqual(
			result.team.length,
			2,
		);

		assert(
			Number.isFinite(
				result.team[0].stat.pts,
			),
		);

		assert(
			Number.isFinite(
				result.team[1].stat.pts,
			),
		);
	}
});

test(
	"football realism large sample produces sane statistical output",
	async () => {
		const NUM_GAMES = 100;
		const TEAM_GAMES = NUM_GAMES * 2;

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

		for (let i = 0; i < NUM_GAMES; i++) {
			const game =
				await initRealismGame(
					1000 + i,
				);

			const result =
				game.run();

			for (const t of result.team) {
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
			passAttempts + sacks;

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
			"FOOTBALL_REALISM_VALIDATION",
			JSON.stringify(
				summary,
			),
		);

		assert(
			Number.isFinite(
				summary.pointsPerTeamGame,
			),
		);

		assert(
			summary.pointsPerTeamGame >
				5 &&
				summary.pointsPerTeamGame <
					60,
		);

		assert(
			summary.passAttemptsPerTeamGame >
				10 &&
				summary.passAttemptsPerTeamGame <
					70,
		);

		assert(
			summary.completionPct >
				0.2 &&
				summary.completionPct <
					0.9,
		);

		assert(
			summary.passYardsPerAttempt >
				2 &&
				summary.passYardsPerAttempt <
					15,
		);

		assert(
			summary.interceptionRate >=
				0 &&
				summary.interceptionRate <
					0.15,
		);

		assert(
			summary.sackRate >=
				0 &&
				summary.sackRate <
					0.25,
		);

		assert(
			summary.rushAttemptsPerTeamGame >
				5 &&
				summary.rushAttemptsPerTeamGame <
					60,
		);

		assert(
			summary.rushYardsPerAttempt >
				1 &&
				summary.rushYardsPerAttempt <
					10,
		);

		assert(
			summary.offensivePlaysPerTeamGame >
				30 &&
				summary.offensivePlaysPerTeamGame <
					100,
		);

		assert(
			summary.passRate >
				0.25 &&
				summary.passRate <
					0.85,
		);
	},
	60_000,
);