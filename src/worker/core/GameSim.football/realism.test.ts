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
				Object.keys(p.roleOvrs