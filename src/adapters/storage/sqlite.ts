import { Database } from "bun:sqlite";
import type { Episode } from "../../core/domain/episode.ts";
import type { FSRSCard } from "../../core/domain/fsrs.ts";
import type { SemanticFact } from "../../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../../core/domain/types.ts";
import type { StoragePort } from "../../ports/storage.ts";

/** SQLite storage adapter using bun:sqlite */
export class SQLiteStorageAdapter implements StoragePort {
	private db: Database;

	constructor(path: string = ":memory:") {
		this.db = new Database(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA foreign_keys = ON");
		this.createTables();
	}

	/** Close the database connection */
	close(): void {
		this.db.close();
	}

	private createTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS episodes (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				title TEXT NOT NULL,
				summary TEXT NOT NULL,
				messages TEXT NOT NULL,
				embedding TEXT NOT NULL,
				surprise REAL NOT NULL,
				stability REAL NOT NULL,
				difficulty REAL NOT NULL,
				start_at INTEGER NOT NULL,
				end_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL,
				last_reviewed_at INTEGER,
				consolidated_at INTEGER
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id)`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS semantic_facts (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				category TEXT NOT NULL,
				fact TEXT NOT NULL,
				keywords TEXT NOT NULL,
				source_episodic_ids TEXT NOT NULL,
				embedding TEXT NOT NULL,
				valid_at INTEGER NOT NULL,
				invalid_at INTEGER,
				created_at INTEGER NOT NULL
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_user_id ON semantic_facts(user_id)`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS message_queue (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				timestamp INTEGER
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_mq_user_id ON message_queue(user_id)`);
	}

	// --- Episodic memory ---

	async saveEpisode(_userId: string, episode: Episode): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO episodes (id, user_id, title, summary, messages, embedding, surprise, stability, difficulty, start_at, end_at, created_at, last_reviewed_at, consolidated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				episode.id,
				episode.userId,
				episode.title,
				episode.summary,
				JSON.stringify(episode.messages),
				JSON.stringify(episode.embedding),
				episode.surprise,
				episode.stability,
				episode.difficulty,
				episode.startAt.getTime(),
				episode.endAt.getTime(),
				episode.createdAt.getTime(),
				episode.lastReviewedAt?.getTime() ?? null,
				episode.consolidatedAt?.getTime() ?? null,
			);
	}

	async getEpisodes(userId: string): Promise<Episode[]> {
		const rows = this.db.prepare("SELECT * FROM episodes WHERE user_id = ?").all(userId) as EpisodeRow[];
		return rows.map(rowToEpisode);
	}

	async getEpisodeById(episodeId: string): Promise<Episode | null> {
		const row = this.db.prepare("SELECT * FROM episodes WHERE id = ?").get(episodeId) as EpisodeRow | null;
		return row ? rowToEpisode(row) : null;
	}

	async getUnconsolidatedEpisodes(userId: string): Promise<Episode[]> {
		const rows = this.db
			.prepare("SELECT * FROM episodes WHERE user_id = ? AND consolidated_at IS NULL")
			.all(userId) as EpisodeRow[];
		return rows.map(rowToEpisode);
	}

	async updateEpisodeFSRS(episodeId: string, card: FSRSCard): Promise<void> {
		this.db
			.prepare("UPDATE episodes SET stability = ?, difficulty = ?, last_reviewed_at = ? WHERE id = ?")
			.run(card.stability, card.difficulty, card.lastReviewedAt?.getTime() ?? null, episodeId);
	}

	async markEpisodeConsolidated(episodeId: string): Promise<void> {
		this.db.prepare("UPDATE episodes SET consolidated_at = ? WHERE id = ?").run(new Date().getTime(), episodeId);
	}

	// --- Semantic memory ---

	async saveFact(_userId: string, fact: SemanticFact): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO semantic_facts (id, user_id, category, fact, keywords, source_episodic_ids, embedding, valid_at, invalid_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				fact.id,
				fact.userId,
				fact.category,
				fact.fact,
				JSON.stringify(fact.keywords),
				JSON.stringify(fact.sourceEpisodicIds),
				JSON.stringify(fact.embedding),
				fact.validAt.getTime(),
				fact.invalidAt?.getTime() ?? null,
				fact.createdAt.getTime(),
			);
	}

	async getFacts(userId: string): Promise<SemanticFact[]> {
		const rows = this.db
			.prepare("SELECT * FROM semantic_facts WHERE user_id = ? AND invalid_at IS NULL")
			.all(userId) as FactRow[];
		return rows.map(rowToFact);
	}

	async getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]> {
		const rows = this.db
			.prepare("SELECT * FROM semantic_facts WHERE user_id = ? AND category = ? AND invalid_at IS NULL")
			.all(userId, category) as FactRow[];
		return rows.map(rowToFact);
	}

	async invalidateFact(factId: string, invalidAt: Date): Promise<void> {
		this.db.prepare("UPDATE semantic_facts SET invalid_at = ? WHERE id = ?").run(invalidAt.getTime(), factId);
	}

	async updateFact(factId: string, updates: Partial<SemanticFact>): Promise<void> {
		const row = this.db.prepare("SELECT * FROM semantic_facts WHERE id = ?").get(factId) as FactRow | null;
		if (!row) return;

		const current = rowToFact(row);
		const merged = { ...current, ...updates };

		this.db
			.prepare(
				`UPDATE semantic_facts SET user_id = ?, category = ?, fact = ?, keywords = ?, source_episodic_ids = ?, embedding = ?, valid_at = ?, invalid_at = ?, created_at = ? WHERE id = ?`,
			)
			.run(
				merged.userId,
				merged.category,
				merged.fact,
				JSON.stringify(merged.keywords),
				JSON.stringify(merged.sourceEpisodicIds),
				JSON.stringify(merged.embedding),
				merged.validAt.getTime(),
				merged.invalidAt?.getTime() ?? null,
				merged.createdAt.getTime(),
				factId,
			);
	}

	// --- Message queue ---

	async pushMessage(userId: string, message: ChatMessage): Promise<void> {
		this.db
			.prepare("INSERT INTO message_queue (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)")
			.run(userId, message.role, message.content, message.timestamp?.getTime() ?? null);
	}

	async getMessageQueue(userId: string): Promise<ChatMessage[]> {
		const rows = this.db
			.prepare("SELECT role, content, timestamp FROM message_queue WHERE user_id = ? ORDER BY id ASC")
			.all(userId) as MessageRow[];
		return rows.map(rowToMessage);
	}

	async clearMessageQueue(userId: string): Promise<void> {
		this.db.prepare("DELETE FROM message_queue WHERE user_id = ?").run(userId);
	}

	// --- Search ---

	async searchEpisodes(userId: string, query: string, limit: number): Promise<Episode[]> {
		const pattern = `%${query}%`;
		const rows = this.db
			.prepare(
				`SELECT * FROM episodes WHERE user_id = ? AND (title LIKE ? COLLATE NOCASE OR summary LIKE ? COLLATE NOCASE) LIMIT ?`,
			)
			.all(userId, pattern, pattern, limit) as EpisodeRow[];
		return rows.map(rowToEpisode);
	}

	async searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]> {
		const pattern = `%${query}%`;
		const rows = this.db
			.prepare(
				`SELECT * FROM semantic_facts WHERE user_id = ? AND invalid_at IS NULL AND (fact LIKE ? COLLATE NOCASE OR keywords LIKE ? COLLATE NOCASE) LIMIT ?`,
			)
			.all(userId, pattern, pattern, limit) as FactRow[];
		return rows.map(rowToFact);
	}
}

// --- Row types and converters ---

interface EpisodeRow {
	id: string;
	user_id: string;
	title: string;
	summary: string;
	messages: string;
	embedding: string;
	surprise: number;
	stability: number;
	difficulty: number;
	start_at: number;
	end_at: number;
	created_at: number;
	last_reviewed_at: number | null;
	consolidated_at: number | null;
}

function rowToEpisode(row: EpisodeRow): Episode {
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		summary: row.summary,
		messages: JSON.parse(row.messages) as ChatMessage[],
		embedding: JSON.parse(row.embedding) as number[],
		surprise: row.surprise,
		stability: row.stability,
		difficulty: row.difficulty,
		startAt: new Date(row.start_at),
		endAt: new Date(row.end_at),
		createdAt: new Date(row.created_at),
		lastReviewedAt: row.last_reviewed_at !== null ? new Date(row.last_reviewed_at) : null,
		consolidatedAt: row.consolidated_at !== null ? new Date(row.consolidated_at) : null,
	};
}

interface FactRow {
	id: string;
	user_id: string;
	category: string;
	fact: string;
	keywords: string;
	source_episodic_ids: string;
	embedding: string;
	valid_at: number;
	invalid_at: number | null;
	created_at: number;
}

function rowToFact(row: FactRow): SemanticFact {
	return {
		id: row.id,
		userId: row.user_id,
		category: row.category as SemanticFact["category"],
		fact: row.fact,
		keywords: JSON.parse(row.keywords) as string[],
		sourceEpisodicIds: JSON.parse(row.source_episodic_ids) as string[],
		embedding: JSON.parse(row.embedding) as number[],
		validAt: new Date(row.valid_at),
		invalidAt: row.invalid_at !== null ? new Date(row.invalid_at) : null,
		createdAt: new Date(row.created_at),
	};
}

interface MessageRow {
	role: string;
	content: string;
	timestamp: number | null;
}

function rowToMessage(row: MessageRow): ChatMessage {
	return {
		role: row.role as ChatMessage["role"],
		content: row.content,
		...(row.timestamp !== null ? { timestamp: new Date(row.timestamp) } : {}),
	};
}
