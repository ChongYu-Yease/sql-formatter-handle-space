import Formatter from "../core/Formatter";
import Tokenizer from "../core/Tokenizer";

const reservedWords = [
    "as", "asc", "auto_increment",
    "between",
    "case", "character set", "charset",
    "comment", "contains",
    "current_timestamp", "current_date", "count", "coalesce",
    "database", "databases", "default", "delete", "desc", "describe",
    "distinct",
    "else", "end", "engine", "exists", "explain",
    "fields", "file", "foreign", "full", "function",
    "global", "grant", "grants", "group_concat",
    "hour",
    "identified", "if", "ifnull", "in", "index", "indexes", "infile", "insert", "interval",
    "into", "invoker", "is",
    "key", "keys", "kill",
    "like",
    "match",
    "minute", "min", "max",
    "modify", "month",
    "names", "now()", "null",
    "partition", "partitions",
    "regexp",
    "rename", "replace", "replication", "reset", "rlike",
    "row", "rows", "row_format",
    "second",
    "storage", "string", "sum",
    "table", "tables", "temporary", "terminated", "then", "to", "true", "truncate", "type", "types",
    "uncommitted", "unique", "unsigned", "usage", "use", "using",
    "variables", "view", "when", "with"
];

const reservedToplevelWords = [
    "delete from",
    "except",
    "group by",
    "order by",
    "having",
    "intersect",
    "modify",
    "select",
    "update",
    "values"
];

const unionWords = [
    "union all",
    "union"
];

const reservedToplevelInLineWords = [
    "use", "drop table", "create table", "from", "where", "limit", "create",
    "insert overwrite", "insert into",
    "inner join",
    "full join",
    "full outer join",
    "join",
    "left join", "left outer join",
    "outer join",
    "right join", "right outer join", "on"
];

const reservedNewlineWords = [
    "and", "or",
    "partitioned by", "row format", "fields terminated by", "lines terminated by", "stored as", "tblproperties",
    "alter table", "add jar", "after", "alter column",
    "cross apply", "cross join", "set",
    "when", "else"
];

let tokenizer;

export default class SparkSqlFormatter {
    /**
     * @param {Object} cfg Different set of configurations
     */
    constructor(cfg) {
        this.cfg = cfg;
    }

    /**
     * Format the whitespace in a SparkSQL string to make it easier to read
     *
     * @param {String} query The SparkSQL string
     * @return {String} formatted string
     */
    format(query) {
        if (!tokenizer) {
            tokenizer = new Tokenizer({
                reservedWords,
                reservedToplevelWords,
                reservedNewlineWords,
                reservedToplevelInLineWords,
                unionWords,
                stringTypes: [`""`, "N''", "''", "``", "[]"],
                openParens: ["(", "CASE"],
                closeParens: [")", "END"],
                indexedPlaceholderTypes: ["?"],
                lineCommentTypes: ["#", "--"]
            });
        }
        return new Formatter(this.cfg, tokenizer).format(query);
    }
}
