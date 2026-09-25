import type { PlayerInjury } from "../../../common/types.ts";
import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";

export type CompositeRating =
	| "passingAccuracy"
	| "passingDeep"
	| "passingVision"
	| "athleticism"
	| "rushing"
	| "catching"
	| "gettingOpen"
	| "passBlocking"
	| "runBlocking"
	| "passRushing"
	| "runStopping"
	| "passCoverage"
	| "tackling"
	| "avoidingSacks"
	| "ballSecurity"
	| "endurance";

export type PenaltyPlayType =
	| "beforeSnap"
	| "kickoffReturn"
	| "fieldGoal"
	| "punt"
	| "puntReturn"
	| "pass"
	| "run";

export type PlayerGameSim = {
	id: number;
	name: string;
	age: number;
	pos: string;
	valueNoPot: number;
	stat: any;
	compositeRating: any;
	skills: string[];
	injured: boolean;
	newInjury: boolean;
	injury: PlayerInjury & {
		playingThrough: boolean;
	};
	ptModifier: number;
	ovrs: Record<Position, number>;

	/*
	 * Football functional-role ratings are calculated once
	 * when the player is loaded into the game simulation.
	 *
	 * Keeping these on PlayerGameSim means formation and
	 * personnel logic can select specialized players without
	 * recalculating role formulas on every snap.
	 *
	 * Optional for compatibility with older tests and any
	 * manually constructed PlayerGameSim objects.
	 */
	roleOvrs?: Partial<
		Record<FunctionalRole, number>
	>;

	seasonStats: Record<string, number>;
};

export type PlayersOnField = Partial<
	Record<Position, PlayerGameSim[]>
>;

export type TeamGameSim = {
	id: number;
	pace: number;
	stat: any;
	player: PlayerGameSim[];
	compositeRating: any;
	depth: Record<Position, PlayerGameSim[]>;
};

/*
 * Offensive personnel follows standard football notation.
 *
 * First digit = running backs
 * Second digit = tight ends
 *
 * The remaining eligible skill players are wide receivers.
 */
export type OffensivePersonnel =
	| "11"
	| "21"
	| "22";

/*
 * Defensive fronts identify the actual structure of
 * the defensive personnel package.
 *
 * These will eventually control which functional DL,
 * LB, CB, and safety roles are selected for each snap.
 */
export type DefensiveFront =
	| "NICKEL_4_2"
	| "BASE_3_4"
	| "BASE_4_3";

export type Formation = {
	off: Partial<Record<Position, number>>;
	def: Partial<Record<Position, number>>;

	/*
	 * Normal offensive formations can identify their
	 * personnel grouping.
	 *
	 * Special-teams formations may omit this.
	 */
	offensivePersonnel?: OffensivePersonnel;

	/*
	 * Normal defensive formations can identify their
	 * defensive front.
	 *
	 * Special-teams formations may omit this.
	 */
	defensiveFront?: DefensiveFront;
};