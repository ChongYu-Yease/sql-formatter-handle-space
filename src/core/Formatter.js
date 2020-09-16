import trimEnd from "lodash/trimEnd";
import tokenTypes from "./tokenTypes";
import Indentation from "./Indentation";
import InlineBlock from "./InlineBlock";
import Params from "./Params";

export default class Formatter {
    /**
     * @param {Object} cfg
     *   @param {Object} cfg.indent
     *   @param {Object} cfg.params
     * @param {Tokenizer} tokenizer
     */
    constructor(cfg, tokenizer) {
        this.cfg = cfg || {};
        this.indentation = new Indentation(this.cfg.indent);
        this.inlineBlock = new InlineBlock();
        this.params = new Params(this.cfg.params);
        this.tokenizer = tokenizer;
        this.previousReservedWord = {};
        this.tokens = [];
        this.index = 0;
    }

    /**
     * Formats whitespaces in a SQL string to make it easier to read.
     *
     * @param {String} query The SQL query string
     * @return {String} formatted query
     */
    format(query) {
        this.tokens = this.tokenizer.tokenize(query);
        const formattedQuery = this.getFormattedQueryFromTokens();

        return formattedQuery.trim();
    }

    getFormattedQueryFromTokens() {
        let formattedQuery = "";

        this.tokens.forEach((token, index) => {
            this.index = index;
            if (token.type === tokenTypes.WHITESPACE) {
                // ignore (we do our own whitespace formatting)
            }
            else if (token.type === tokenTypes.LINE_COMMENT) {
                formattedQuery = this.formatLineComment(token, formattedQuery);
                // formattedQuery = this.formatWithSpaces(token, formattedQuery);
            }
            else if (token.type === tokenTypes.BLOCK_COMMENT) {
                formattedQuery = this.formatBlockComment(token, formattedQuery);
            }
            else if (token.type === tokenTypes.RESERVED_TOPLEVEL) {
                formattedQuery = this.formatToplevelReservedWord(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.RESERVED_NEWLINE) {
                formattedQuery = this.formatNewlineReservedWord(token, formattedQuery);
                if (/^ADD JAR/i.test(token.value) || (/^SET/i).test(token.value)) {
                    this.indentation.setWhiteSpace(false);
                }
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.RESERVED_TOPLEVEL_INLINE) {
                formattedQuery = this.formatToplevelInLineReservedWord(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.UNION_WORDS) {
                formattedQuery = this.formatUnionWords(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.RESERVED) {
                if (/^BETWEEN/i.test(token.value)) {
                    this.indentation.setNoNewLine();
                }
                formattedQuery = this.formaReserverdWords(token, formattedQuery);
                this.previousReservedWord = token;
            }
            else if (token.type === tokenTypes.OPEN_PAREN) {
                formattedQuery = this.formatOpeningParentheses(token, formattedQuery);
            }
            else if (token.type === tokenTypes.CLOSE_PAREN) {
                formattedQuery = this.formatClosingParentheses(token, formattedQuery);
            }
            else if (token.type === tokenTypes.PLACEHOLDER) {
                formattedQuery = this.formatPlaceholder(token, formattedQuery);
            }
            else if (token.value === ",") {
                formattedQuery = this.formatComma(token, formattedQuery);
            }
            else if (token.value === ":") {
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            }
            else if (token.value === ".") {
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            }
            else if (token.value === ";") {
                this.indentation.setWhiteSpace(true);
                formattedQuery = this.endCodeBlock(token, formattedQuery);
            }
            else {
                formattedQuery = this.formatWithSpaces(token, formattedQuery);
            }
        });
        return formattedQuery;
    }

    formatLineComment(token, query) {
        const follow = this.followNonWhitespaceTokenIndex();
        if (follow.token.value === ",") {
            const commaToken = this.tokens[follow.index];
            this.tokens[follow.index] = token;
            this.tokens[this.index] = commaToken;
            return this.formatComma(commaToken, query);
        }

        if (this.previousNonWhitespaceToken().type === tokenTypes.UNION_WORDS) {

            query = trimEnd(query) + " " + token.value;
            this.indentation.setNoTrimEnd();
            return query;
        }
        else if (this.previousNonWhitespaceToken().value !== ";" &&
            this.previousNonWhitespaceToken().type !== tokenTypes.LINE_COMMENT) {
            return trimEnd(query) + " " + this.addNewline(token.value);
        }
        else {
            return this.addNewline(query) + this.addNewline(token.value);
        }

    }

    formatBlockComment(token, query) {
        return this.addNewline(this.addNewline(query) + this.indentComment(token.value));
    }

    indentComment(comment) {
        return comment.replace(/\n/g, "\n" + this.indentation.getIndent());
    }

    formatToplevelReservedWord(token, query) {
        this.indentation.decreaseTopLevel();
        if (this.previousNonWhitespaceToken().type !== tokenTypes.OPEN_PAREN) {
            query = this.addNewline(query);
        }
        else {
            query = trimEnd(query) + " ";
        }
        this.indentation.increaseToplevel();

        query += this.equalizeWhitespace(token.value.toLowerCase());
        return this.addNewline(query);
    }

    formatToplevelInLineReservedWord(token, query) {
        this.indentation.decreaseTopLevel();

        query = this.addNewline(query);

        this.indentation.increaseToplevel();

        query += this.equalizeWhitespace(token.value.toLowerCase());
        return query + " ";
    }

    formatUnionWords(token, query) {
        this.indentation.setNoTrimEnd();
        query = query + "\n" + this.indentation.getIndent();
        this.indentation.decreaseTopLevel();
        this.indentation.setNoTrimEnd();
        query = query + "\n" + this.indentation.getIndent();

        query = query + token.value.toLowerCase() + "\n";
        this.indentation.setNoTrimEnd();

        return query;
    }

    formatNewlineReservedWord(token, query) {
        if (this.indentation.getStartNewLine()) {
            return this.addNewline(query) + this.equalizeWhitespace(token.value.toLowerCase()) + " ";
        }
        else {
            return query + this.equalizeWhitespace(token.value.toLowerCase()) + " ";
        }

    }

    // Replace any sequence of whitespace characters with single space
    equalizeWhitespace(string) {
        return string.replace(/\s+/g, " ");
    }

    // Opening parentheses increase the block indent level and start a new line
    formatOpeningParentheses(token, query) {
        // Take out the preceding space unless there was whitespace there in the original query
        // or another opening parens or line comment
        if (this.previousNonWhitespaceToken().type === tokenTypes.RESERVED_TOPLEVEL_INLINE ||
            (this.previousNonWhitespaceToken().value === "," && token.value.toLowerCase() === "case")) {
            query = this.addNewline(query) + token.value;
            this.indentation.increaseBlockLevel();
            return query;
        }
        else {
            const preserveWhitespaceFor = [
                tokenTypes.WHITESPACE,
                tokenTypes.OPEN_PAREN,
                tokenTypes.LINE_COMMENT,
            ];
            if (!preserveWhitespaceFor.includes(this.previousToken().type)) {
                query = trimEnd(query);
            }
            query += token.value;

            this.inlineBlock.beginIfPossible(this.tokens, this.index);

            if (!this.inlineBlock.isActive()) {
                this.indentation.increaseBlockLevel();
                query = this.addNewline(query);
            }
            return query;
        }
    }

    // Closing parentheses decrease the block indent level
    formatClosingParentheses(token, query) {
        if (this.inlineBlock.isActive()) {
            this.inlineBlock.end();
            return this.formatWithSpaceAfter(token, query);
        }
        else {
            this.indentation.decreaseBlockLevel();
            return this.formatWithSpaces(token, this.addNewline(query));
        }
    }

    formatPlaceholder(token, query) {
        return query + this.params.get(token) + " ";
    }

    endCodeBlock(token, query) {
        query = query + token.value + "\n";
        this.indentation.setNoTrimEnd();
        this.indentation.decreaseBlockLevel();
        return query;
    }

    // Commas start a new line (unless within inline parentheses or SQL "LIMIT" clause)
    formatComma(token, query) {
        query = this.trimTrailingWhitespace(query) + token.value + " ";

        if (this.inlineBlock.isActive()) {
            return query;
        }
        else if (/^LIMIT$/i.test(this.previousReservedWord.value)) {
            return query;
        }
        else {
            return this.addNewline(query);
        }
    }

    formatWithSpaceAfter(token, query) {
        return this.trimTrailingWhitespace(query) + token.value + " ";
    }

    formatWithoutSpaces(token, query) {
        return this.trimTrailingWhitespace(query) + token.value;
    }

    formaReserverdWords(token, query) {
        if (this.indentation.getWhiteSpace()) {
            return query + token.value.toLowerCase() + " ";
        }
        else {
            return query + token.value.toLowerCase();
        }
    }

    formatWithSpaces(token, query) {
        if (this.indentation.getWhiteSpace()) {
            return query + token.value + " ";
        }
        else {
            return query + token.value;
        }
    }

    addNewline(query) {
        if (this.indentation.getTrimEnd()) {
            return trimEnd(query) + "\n" + this.indentation.getIndent();
        }
        else {
            return query + "\n" + this.indentation.getIndent();
        }

    }

    trimTrailingWhitespace(query) {
        if (this.previousNonWhitespaceToken().type === tokenTypes.LINE_COMMENT) {
            return trimEnd(query) + "\n";
        }
        else {
            return trimEnd(query);
        }
    }

    previousNonWhitespaceToken() {
        let n = 1;
        while (this.previousToken(n).type === tokenTypes.WHITESPACE) {
            n++;
        }
        return this.previousToken(n);
    }

    previousToken(offset = 1) {
        return this.tokens[this.index - offset] || {};
    }

    followNonWhitespaceTokenIndex() {
        let n = 1;
        while (this.followToken(n).type === tokenTypes.WHITESPACE) {
            n++;
        }
        return {token: this.followToken(n), index: this.index + n};
    }

    followToken(offset = 1) {
        return this.tokens[this.index + offset] || {};
    }
}
