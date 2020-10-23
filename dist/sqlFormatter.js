import trimEnd from 'lodash/trimEnd';
import repeat from 'lodash/repeat';
import last from 'lodash/last';
import isEmpty from 'lodash/isEmpty';
import escapeRegExp from 'lodash/escapeRegExp';

/**
 * Constants for token types
 */
var tokenTypes = {
    WHITESPACE: "whitespace",
    WORD: "word",
    STRING: "string",
    RESERVED: "reserved",
    RESERVED_TOPLEVEL: "reserved-toplevel",
    RESERVED_TOPLEVEL_INLINE: "reserved-toplevel-inline",
    UNION_WORDS: "union-words",
    RESERVED_NEWLINE: "reserved-newline",
    OPERATOR: "operator",
    OPEN_PAREN: "open-paren",
    CLOSE_PAREN: "close-paren",
    LINE_COMMENT: "line-comment",
    BLOCK_COMMENT: "block-comment",
    NUMBER: "number",
    PLACEHOLDER: "placeholder"
};

const INDENT_TYPE_TOP_LEVEL = 'top-level';
const INDENT_TYPE_BLOCK_LEVEL = 'block-level';

/**
 * Manages indentation levels.
 *
 * There are two types of indentation levels:
 *
 * - BLOCK_LEVEL : increased by open-parenthesis
 * - TOP_LEVEL : increased by RESERVED_TOPLEVEL words
 */
class Indentation {
    /**
     * @param {String} indent Indent value, default is "  " (2 spaces)
     */
    constructor(indent) {
        this.indent = indent || '  ';
        this.indentTypes = [];
    }

    // toTrimEnd = true;
    // toStartNewLine = true;
    // toSetWhiteSpace = true;

    setNoTrimEnd() {
        this.toTrimEnd = false;
    }

    getTrimEnd() {
        if (this.toTrimEnd) {
            return true
        } else {
            this.toTrimEnd = true;
            return false
        }
    }

    setNoNewLine() {
        this.toStartNewLine = false;
    }

    getStartNewLine() {
        if (this.toStartNewLine) {
            return true
        } else {
            this.toStartNewLine = true;
            return false
        }
    }

    setWhiteSpace(set) {
        this.toSetWhiteSpace = set;
    }

    getWhiteSpace() {
        return this.toSetWhiteSpace
    }

    /**
     * Returns current indentation string.
     * @return {String}
     */
    getIndent() {
        return repeat(this.indent, this.indentTypes.length)
    }

    /**
     * Increases indentation by one top-level indent.
     */
    increaseToplevel() {
        this.indentTypes.push(INDENT_TYPE_TOP_LEVEL);
    }

    /**
     * Increases indentation by one block-level indent.
     */
    increaseBlockLevel() {
        this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL);
    }

    /**
     * Decreases indentation by one top-level indent.
     * Does nothing when the previous indent is not top-level.
     */
    decreaseTopLevel() {
        if (last(this.indentTypes) === INDENT_TYPE_TOP_LEVEL) {
            this.indentTypes.pop();
        }
    }

    /**
     * Decreases indentation by one block-level indent.
     * If there are top-level indents within the block-level indent,
     * throws away these as well.
     */
    decreaseBlockLevel() {
        while (this.indentTypes.length > 0) {
            const type = this.indentTypes.pop();
            if (type !== INDENT_TYPE_TOP_LEVEL) {
                break
            }
        }
    }
}

const INLINE_MAX_LENGTH = 200;

/**
 * Bookkeeper for inline blocks.
 *
 * Inline blocks are parenthized expressions that are shorter than INLINE_MAX_LENGTH.
 * These blocks are formatted on a single line, unlike longer parenthized
 * expressions where open-parenthesis causes newline and increase of indentation.
 */
class InlineBlock {
    constructor() {
        this.level = 0;
    }

    /**
     * Begins inline block when lookahead through upcoming tokens determines
     * that the block would be smaller than INLINE_MAX_LENGTH.
     * @param  {Object[]} tokens Array of all tokens
     * @param  {Number} index Current token position
     */
    beginIfPossible(tokens, index) {
        if (this.level === 0 && this.isInlineBlock(tokens, index)) {
            this.level = 1;
        }
        else if (this.level > 0) {
            this.level++;
        }
        else {
            this.level = 0;
        }
    }

    /**
     * Finishes current inline block.
     * There might be several nested ones.
     */
    end() {
        this.level--;
    }

    /**
     * True when inside an inline block
     * @return {Boolean}
     */
    isActive() {
        return this.level > 0;
    }

    // Check if this should be an inline parentheses block
    // Examples are "NOW()", "COUNT(*)", "int(10)", key(`somecolumn`), DECIMAL(7,2)
    isInlineBlock(tokens, index) {
        let length = 0;
        let level = 0;

        for (let i = index; i < tokens.length; i++) {
            const token = tokens[i];
            length += token.value.length;

            // Overran max length
            if (length > INLINE_MAX_LENGTH) {
                return false;
            }

            if (token.type === tokenTypes.OPEN_PAREN) {
                level++;
            }
            else if (token.type === tokenTypes.CLOSE_PAREN) {
                level--;
                if (level === 0) {
                    return true;
                }
            }

            if (this.isForbiddenToken(token)) {
                return false;
            }
        }
        return false;
    }

    // Reserved words that cause newlines, comments and semicolons
    // are not allowed inside inline parentheses block
    isForbiddenToken({type, value}) {
        return type === tokenTypes.RESERVED_TOPLEVEL ||
            type === tokenTypes.RESERVED_NEWLINE ||
            type === tokenTypes.COMMENT ||
            type === tokenTypes.BLOCK_COMMENT ||
            value === ";";
    }
}

/**
 * Handles placeholder replacement with given params.
 */
class Params {
    /**
     * @param {Object} params
     */
    constructor(params) {
        this.params = params;
        this.index = 0;
    }

    /**
     * Returns param value that matches given placeholder with param key.
     * @param {Object} token
     *   @param {String} token.key Placeholder key
     *   @param {String} token.value Placeholder value
     * @return {String} param or token.value when params are missing
     */
    get({key, value}) {
        if (!this.params) {
            return value;
        }
        if (key) {
            return this.params[key];
        }
        return this.params[this.index ++];
    }
}

class Formatter {
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
        // 将整段sql中所有的单词、符号、换行符全部拿出来 变成一个对象数组 对象里面有两个字段 type 和 value
        this.tokens = this.tokenizer.tokenize(query);

        const formattedQuery = this.getFormattedQueryFromTokens();

        return formattedQuery.trim()
    }

    getFormattedQueryFromTokens() {
        let formattedQuery = '';

        this.tokens.forEach((token, index) => {
            this.index = index;
            if (token.type === tokenTypes.WHITESPACE) ; else if (token.type === tokenTypes.LINE_COMMENT) {
                formattedQuery = this.formatLineComment(token, formattedQuery);
                // formattedQuery = this.formatWithSpaces(token, formattedQuery);
            } else if (token.type === tokenTypes.BLOCK_COMMENT) {
                formattedQuery = this.formatBlockComment(token, formattedQuery);
            } else if (token.type === tokenTypes.RESERVED_TOPLEVEL) {
                // 处理 select 字段
                formattedQuery = this.formatToplevelReservedWord(
                    token,
                    formattedQuery
                );
                this.previousReservedWord = token;
            } else if (token.type === tokenTypes.RESERVED_NEWLINE) {
                formattedQuery = this.formatNewlineReservedWord(
                    token,
                    formattedQuery
                );
                // 处理 add jar 或者 set xxx 做的兼容
                if (
                    /^ADD JAR/i.test(token.value) ||
                    /^SET/i.test(token.value)
                ) {
                    this.indentation.setWhiteSpace(false);
                }
                this.previousReservedWord = token;
            } else if (token.type === tokenTypes.RESERVED_TOPLEVEL_INLINE) {
                formattedQuery = this.formatToplevelInLineReservedWord(
                    token,
                    formattedQuery
                );
                this.previousReservedWord = token;
            } else if (token.type === tokenTypes.UNION_WORDS) {
                formattedQuery = this.formatUnionWords(token, formattedQuery);
                this.previousReservedWord = token;
            } else if (token.type === tokenTypes.RESERVED) {
                if (/^BETWEEN/i.test(token.value)) {
                    this.indentation.setNoNewLine();
                }
                formattedQuery = this.formaReserverdWords(token, formattedQuery);
                this.previousReservedWord = token;
            } else if (token.type === tokenTypes.OPEN_PAREN) {
                // 处理 左括号
                formattedQuery = this.formatOpeningParentheses(
                    token,
                    formattedQuery
                );
            } else if (token.type === tokenTypes.CLOSE_PAREN) {
                // 处理 右括号
                formattedQuery = this.formatClosingParentheses(
                    token,
                    formattedQuery
                );
            } else if (token.type === tokenTypes.PLACEHOLDER) {
                formattedQuery = this.formatPlaceholder(token, formattedQuery);
            } else if (token.value === ',') {
                // 处理逗号
                formattedQuery = this.formatComma(token, formattedQuery);
            } else if (token.value === ':') {
                // 处理冒号
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            } else if (token.value === '.') {
                // 处理 点
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            } else if (token.value === '$') {
                // 处理 $
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            } else if (token.value === '{') {
                // 处理 {
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            } else if (token.value === '}') {
                // 处理 }
                formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
            } else if (token.value === ';') {
                // 处理分号
                this.indentation.setWhiteSpace(true);
                formattedQuery = this.endCodeBlock(token, formattedQuery);
            } else {
                formattedQuery = this.formatWithSpaces(token, formattedQuery);
            }
        });
        return formattedQuery
    }
    // 处理行注释
    formatLineComment(token, query) {
        const follow = this.followNonWhitespaceTokenIndex();
        if (follow.token.value === ',') {
            const commaToken = this.tokens[follow.index];
            this.tokens[follow.index] = token;
            this.tokens[this.index] = commaToken;
            return this.formatComma(commaToken, query)
        }

        // 给获取过来的每一行行注释 从下标2开始添加空格
        const value = token.value;
        token.value = value.split('');
        // 先判断第三个是不是空格
        if (token.value[2] === ' ') {
            token.value = token.value.join('');
        } else {
            token.value.splice(2, 0, ' ');
            token.value = token.value.join('');
        }

        if (this.previousNonWhitespaceToken().type === tokenTypes.UNION_WORDS) {
            query = trimEnd(query) + ' ' + token.value;
            this.indentation.setNoTrimEnd();
            return query
        } else if (
            this.previousNonWhitespaceToken().value !== ';' &&
            this.previousNonWhitespaceToken().type !== tokenTypes.LINE_COMMENT
        ) {
            return trimEnd(query) + ' ' + this.addNewline(token.value)
        } else {
            return this.addNewline(query) + this.addNewline(token.value)
        }
    }

    formatBlockComment(token, query) {
        // 给获取过来的每一行行注释 从下标2开始添加空格
        const value = token.value;
        token.value = value.split('');
        // 先判断第三个是不是空格
        if (token.value[2] === ' ') {
            token.value = token.value.join('');
        } else {
            token.value.splice(2, 0, ' ');
            token.value = token.value.join('');
        }
        return this.addNewline(
            this.addNewline(query) + this.indentComment(token.value)
        )
    }

    indentComment(comment) {
        return comment.replace(/\n/g, '\n' + this.indentation.getIndent())
    }
    // 处理 select 字段
    formatToplevelReservedWord(token, query) {
        this.indentation.decreaseTopLevel();
        if (this.previousNonWhitespaceToken().type !== tokenTypes.OPEN_PAREN) {
            query = this.addNewline(query);
        } else {
            query = trimEnd(query) + ' ';
        }
        this.indentation.increaseToplevel();

        query += this.equalizeWhitespace(token.value.toLowerCase());
        return this.addNewline(query)
    }

    formatToplevelInLineReservedWord(token, query) {
        this.indentation.decreaseTopLevel();

        query = this.addNewline(query);

        this.indentation.increaseToplevel();

        query += this.equalizeWhitespace(token.value.toLowerCase());
        return query + ' '
    }

    formatUnionWords(token, query) {
        this.indentation.setNoTrimEnd();
        query = query + '\n' + this.indentation.getIndent();
        this.indentation.decreaseTopLevel();
        this.indentation.setNoTrimEnd();
        query = query + '\n' + this.indentation.getIndent();

        query = query + token.value.toLowerCase() + '\n';
        this.indentation.setNoTrimEnd();

        return query
    }

    formatNewlineReservedWord(token, query) {
        if (this.indentation.getStartNewLine()) {
            return (
                this.addNewline(query) +
                this.equalizeWhitespace(token.value.toLowerCase()) +
                ' '
            )
        } else {
            return (
                query + this.equalizeWhitespace(token.value.toLowerCase()) + ' '
            )
        }
    }

    // Replace any sequence of whitespace characters with single space
    equalizeWhitespace(string) {
        return string.replace(/\s+/g, ' ')
    }

    // Opening parentheses increase the block indent level and start a new line
    formatOpeningParentheses(token, query) {
        // Take out the preceding space unless there was whitespace there in the original query
        // or another opening parens or line comment
        //取出前面的空格，除非原始查询中有空格
        //或其他开头括号或行注释
        // 处理左括号
        if (
            this.previousNonWhitespaceToken().type ===
                tokenTypes.RESERVED_TOPLEVEL_INLINE ||
            (this.previousNonWhitespaceToken().value === ',' &&
                token.value.toLowerCase() === 'case')
        ) {
            query = this.addNewline(query) + token.value;
            this.indentation.increaseBlockLevel();
            return query
        } else {
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
            return query
        }
    }

    // Closing parentheses decrease the block indent level
    formatClosingParentheses(token, query) {
        if (this.inlineBlock.isActive()) {
            this.inlineBlock.end();
            return this.formatWithSpaceAfter(token, query)
        } else {
            this.indentation.decreaseBlockLevel();
            return this.formatWithSpaces(token, this.addNewline(query))
        }
    }

    formatPlaceholder(token, query) {
        return query + this.params.get(token) + ' '
    }

    endCodeBlock(token, query) {
        query = query + token.value + '\n';
        this.indentation.setNoTrimEnd();
        this.indentation.decreaseBlockLevel();
        return query
    }

    // Commas start a new line (unless within inline parentheses or SQL "LIMIT" clause)
    // 处理逗号
    // 逗号开始新的一行（除非在内联括号或SQL“LIMIT”子句中）
    formatComma(token, query) {
        query = this.trimTrailingWhitespace(query) + token.value + ' ';

        if (this.inlineBlock.isActive()) {
            return query
        } else if (/^LIMIT$/i.test(this.previousReservedWord.value)) {
            return query
        } else {
            return this.addNewline(query)
        }
    }

    formatWithSpaceAfter(token, query) {
        return this.trimTrailingWhitespace(query) + token.value + ' '
    }

    formatWithoutSpaces(token, query) {
        return this.trimTrailingWhitespace(query) + token.value
    }

    formaReserverdWords(token, query) {
        if (this.indentation.getWhiteSpace()) {
            return query + token.value.toLowerCase() + ' '
        } else {
            // 如果关键字 as if 等关键字 前面有空格 就不用加空格了 如果前面没有空格 就需要加一个空格
            if (query.charAt(query.length - 1) === ' ') {
                return query + token.value.toLowerCase() + ' '
            } else {
                return query + ' ' + token.value.toLowerCase() + ' '
            }
        }
    }

    formatWithSpaces(token, query) {
        if (token.value === '$' || token.value === '{' || token.value === '}') {
            console.log(token, query);
        }
        if (this.indentation.getWhiteSpace()) {
            return query + token.value + ' '
        } else {
            return query + token.value
        }
    }

    addNewline(query) {
        if (this.indentation.getTrimEnd()) {
            return trimEnd(query) + '\n' + this.indentation.getIndent()
        } else {
            return query + '\n' + this.indentation.getIndent()
        }
    }

    trimTrailingWhitespace(query) {
        if (
            this.previousNonWhitespaceToken().type === tokenTypes.LINE_COMMENT
        ) {
            return trimEnd(query) + '\n'
        } else {
            return trimEnd(query)
        }
    }

    previousNonWhitespaceToken() {
        let n = 1;
        while (this.previousToken(n).type === tokenTypes.WHITESPACE) {
            n++;
        }
        return this.previousToken(n)
    }

    previousToken(offset = 1) {
        return this.tokens[this.index - offset] || {}
    }

    followNonWhitespaceTokenIndex() {
        let n = 1;
        while (this.followToken(n).type === tokenTypes.WHITESPACE) {
            n++;
        }
        return { token: this.followToken(n), index: this.index + n }
    }

    followToken(offset = 1) {
        return this.tokens[this.index + offset] || {}
    }
}

class Tokenizer {
    /**
     * @param {Object} cfg
     *  @param {String[]} cfg.reservedWords Reserved words in SQL
     *  @param {String[]} cfg.reservedToplevelWords Words that are set to new line separately
     *  @param {String[]} cfg.reservedNewlineWords Words that are set to newline
     *  @param {String[]} cfg.reservedToplevelInLineWords Words that are set to newline
     *  @param {String[]} cfg.unionWords Words that are set to union lines
     *  @param {String[]} cfg.stringTypes String types to enable: "", '', ``, [], N''
     *  @param {String[]} cfg.openParens Opening parentheses to enable, like (, [
     *  @param {String[]} cfg.closeParens Closing parentheses to enable, like ), ]
     *  @param {String[]} cfg.indexedPlaceholderTypes Prefixes for indexed placeholders, like ?
     *  @param {String[]} cfg.namedPlaceholderTypes Prefixes for named placeholders, like @ and :
     *  @param {String[]} cfg.lineCommentTypes Line comments to enable, like # and --
     *  @param {String[]} cfg.specialWordChars Special chars that can be found inside of words, like @ and #
     */
    constructor(cfg) {
        this.WHITESPACE_REGEX = /^(\s+)/;
        this.NUMBER_REGEX = /^((-\s*)?[0-9]+(\.[0-9]+)?|0x[0-9a-fA-F]+|0b[01]+)\b/;
        this.OPERATOR_REGEX = /^(!=|<>|==|<=|>=|!<|!>|\|\||::|->>|->|~~\*|~~|!~~\*|!~~|~\*|!~\*|!~|.)/;

        this.BLOCK_COMMENT_REGEX = /^(\/\*[^]*?(?:\*\/|$))/;
        this.LINE_COMMENT_REGEX = this.createLineCommentRegex(
            cfg.lineCommentTypes
        );

        this.RESERVED_TOPLEVEL_REGEX = this.createReservedWordRegex(
            cfg.reservedToplevelWords
        );
        this.RESERVED_NEWLINE_REGEX = this.createReservedWordRegex(
            cfg.reservedNewlineWords
        );
        this.RESERVED_PLAIN_REGEX = this.createReservedWordRegex(
            cfg.reservedWords
        );
        this.RESERVED_TOPLEVEL_INLINE_REGEX = this.createReservedWordRegex(
            cfg.reservedToplevelInLineWords
        );
        this.UNION_WORDS_REGEX = this.createReservedWordRegex(cfg.unionWords);

        this.WORD_REGEX = this.createWordRegex(cfg.specialWordChars);
        this.STRING_REGEX = this.createStringRegex(cfg.stringTypes);

        this.OPEN_PAREN_REGEX = this.createParenRegex(cfg.openParens);
        this.CLOSE_PAREN_REGEX = this.createParenRegex(cfg.closeParens);

        this.INDEXED_PLACEHOLDER_REGEX = this.createPlaceholderRegex(
            cfg.indexedPlaceholderTypes,
            '[0-9]*'
        );
        this.IDENT_NAMED_PLACEHOLDER_REGEX = this.createPlaceholderRegex(
            cfg.namedPlaceholderTypes,
            '[a-zA-Z0-9._$]+'
        );
        this.STRING_NAMED_PLACEHOLDER_REGEX = this.createPlaceholderRegex(
            cfg.namedPlaceholderTypes,
            this.createStringPattern(cfg.stringTypes)
        );
    }

    createLineCommentRegex(lineCommentTypes) {
        return new RegExp(
            `^((?:${lineCommentTypes
                .map((c) => escapeRegExp(c))
                .join('|')}).*?(?:\n|$))`
        )
    }

    createReservedWordRegex(reservedWords) {
        const reservedWordsPattern = reservedWords
            .join('|')
            .replace(/ /g, '\\s+');
        return new RegExp(`^(${reservedWordsPattern})\\b`, 'i')
    }

    createWordRegex(specialChars = []) {
        return new RegExp(`^([\\w${specialChars.join('')}]+)`)
    }

    createStringRegex(stringTypes) {
        return new RegExp('^(' + this.createStringPattern(stringTypes) + ')')
    }

    // This enables the following string patterns:
    // 1. backtick quoted string using `` to escape
    // 2. square bracket quoted string (SQL Server) using ]] to escape
    // 3. double quoted string using "" or \" to escape
    // 4. single quoted string using '' or \' to escape
    // 5. national character quoted string using N'' or N\' to escape
    createStringPattern(stringTypes) {
        const patterns = {
            '``': '((`[^`]*($|`))+)',
            '[]': '((\\[[^\\]]*($|\\]))(\\][^\\]]*($|\\]))*)',
            '""': '(("[^"\\\\]*(?:\\\\.[^"\\\\]*)*("|$))+)',
            "''": "(('[^'\\\\]*(?:\\\\.[^'\\\\]*)*('|$))+)",
            "N''": "((N'[^N'\\\\]*(?:\\\\.[^N'\\\\]*)*('|$))+)",
        };

        return stringTypes.map((t) => patterns[t]).join('|')
    }

    createParenRegex(parens) {
        return new RegExp(
            '^(' + parens.map((p) => this.escapeParen(p)).join('|') + ')',
            'i'
        )
    }

    escapeParen(paren) {
        if (paren.length === 1) {
            // A single punctuation character
            return escapeRegExp(paren)
        } else {
            // longer word
            return '\\b' + paren + '\\b'
        }
    }

    createPlaceholderRegex(types, pattern) {
        if (isEmpty(types)) {
            return false
        }
        const typesRegex = types.map(escapeRegExp).join('|');

        return new RegExp(`^((?:${typesRegex})(?:${pattern}))`)
    }

    /**
     * Takes a SQL string and breaks it into tokens.
     * Each token is an object with type and value.
     *
     * @param {String} input The SQL string
     * @return {Object[]} tokens An array of tokens.
     *  @return {String} token.type
     *  @return {String} token.value
     */
    tokenize(input) {
        const tokens = [];
        let token;

        // Keep processing the string until it is empty
        while (input.length) {
            // Get the next token and the token type
            token = this.getNextToken(input, token);
            // Advance the string
            input = input.substring(token.value.length);

            tokens.push(token);
        }
        return tokens
    }

    getNextToken(input, previousToken) {
        return (
            this.getWhitespaceToken(input) ||
            this.getCommentToken(input) ||
            this.getStringToken(input) ||
            this.getOpenParenToken(input) ||
            this.getCloseParenToken(input) ||
            // this.getPlaceholderToken(input) ||
            this.getNumberToken(input) ||
            this.getReservedWordToken(input, previousToken) ||
            this.getWordToken(input) ||
            this.getOperatorToken(input)
        )
    }

    getWhitespaceToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.WHITESPACE,
            regex: this.WHITESPACE_REGEX,
        })
    }

    getCommentToken(input) {
        return (
            this.getLineCommentToken(input) || this.getBlockCommentToken(input)
        )
    }

    getLineCommentToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.LINE_COMMENT,
            regex: this.LINE_COMMENT_REGEX,
        })
    }

    getBlockCommentToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.BLOCK_COMMENT,
            regex: this.BLOCK_COMMENT_REGEX,
        })
    }

    getStringToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.STRING,
            regex: this.STRING_REGEX,
        })
    }

    getOpenParenToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.OPEN_PAREN,
            regex: this.OPEN_PAREN_REGEX,
        })
    }

    getCloseParenToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.CLOSE_PAREN,
            regex: this.CLOSE_PAREN_REGEX,
        })
    }

    getPlaceholderToken(input) {
        return (
            this.getIdentNamedPlaceholderToken(input) ||
            this.getStringNamedPlaceholderToken(input) ||
            this.getIndexedPlaceholderToken(input)
        )
    }

    getIdentNamedPlaceholderToken(input) {
        return this.getPlaceholderTokenWithKey({
            input,
            regex: this.IDENT_NAMED_PLACEHOLDER_REGEX,
            parseKey: (v) => v.slice(1),
        })
    }

    getStringNamedPlaceholderToken(input) {
        return this.getPlaceholderTokenWithKey({
            input,
            regex: this.STRING_NAMED_PLACEHOLDER_REGEX,
            parseKey: (v) =>
                this.getEscapedPlaceholderKey({
                    key: v.slice(2, -1),
                    quoteChar: v.slice(-1),
                }),
        })
    }

    getIndexedPlaceholderToken(input) {
        return this.getPlaceholderTokenWithKey({
            input,
            regex: this.INDEXED_PLACEHOLDER_REGEX,
            parseKey: (v) => v.slice(1),
        })
    }

    getPlaceholderTokenWithKey({ input, regex, parseKey }) {
        const token = this.getTokenOnFirstMatch({
            input,
            regex,
            type: tokenTypes.PLACEHOLDER,
        });
        if (token) {
            token.key = parseKey(token.value);
        }
        return token
    }

    getEscapedPlaceholderKey({ key, quoteChar }) {
        return key.replace(
            new RegExp(escapeRegExp('\\') + quoteChar, 'g'),
            quoteChar
        )
    }

    // Decimal, binary, or hex numbers
    getNumberToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.NUMBER,
            regex: this.NUMBER_REGEX,
        })
    }

    // Punctuation and symbols
    getOperatorToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.OPERATOR,
            regex: this.OPERATOR_REGEX,
        })
    }

    getReservedWordToken(input, previousToken) {
        // A reserved word cannot be preceded by a "."
        // this makes it so in "mytable.from", "from" is not considered a reserved word
        if (
            previousToken &&
            previousToken.value &&
            previousToken.value === '.'
        ) {
            return
        }
        return (
            this.getToplevelReservedToken(input) ||
            this.getToplevelInLineReservedToken(input) ||
            this.getNewlineReservedToken(input) ||
            this.getPlainReservedToken(input) ||
            this.getUnionWordsToken(input)
        )
    }

    getToplevelReservedToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.RESERVED_TOPLEVEL,
            regex: this.RESERVED_TOPLEVEL_REGEX,
        })
    }

    getToplevelInLineReservedToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.RESERVED_TOPLEVEL_INLINE,
            regex: this.RESERVED_TOPLEVEL_INLINE_REGEX,
        })
    }

    getNewlineReservedToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.RESERVED_NEWLINE,
            regex: this.RESERVED_NEWLINE_REGEX,
        })
    }

    getUnionWordsToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.UNION_WORDS,
            regex: this.UNION_WORDS_REGEX,
        })
    }

    getPlainReservedToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.RESERVED,
            regex: this.RESERVED_PLAIN_REGEX,
        })
    }

    getWordToken(input) {
        return this.getTokenOnFirstMatch({
            input,
            type: tokenTypes.WORD,
            regex: this.WORD_REGEX,
        })
    }

    getTokenOnFirstMatch({ input, type, regex }) {
        const matches = input.match(regex);

        if (matches) {
            return { type, value: matches[1] }
        }
    }
}

const reservedWords = [
    'as',
    'asc',
    'auto_increment',
    'between',
    'case',
    'character set',
    'charset',
    'comment',
    'contains',
    'current_timestamp',
    'current_date',
    'count',
    'coalesce',
    'database',
    'databases',
    'default',
    'delete',
    'desc',
    'describe',
    'distinct',
    'else',
    'end',
    'engine',
    'exists',
    'explain',
    'fields',
    'file',
    'foreign',
    'full',
    'function',
    'global',
    'grant',
    'grants',
    'group_concat',
    'hour',
    'identified',
    'if',
    'ifnull',
    'in',
    'index',
    'indexes',
    'infile',
    'insert',
    'interval',
    'into',
    'invoker',
    'is',
    'key',
    'keys',
    'kill',
    'like',
    'match',
    'minute',
    'min',
    'max',
    'modify',
    'month',
    'names',
    'now()',
    'null',
    'partition',
    'partitions',
    'regexp',
    'rename',
    'replace',
    'replication',
    'reset',
    'rlike',
    'row',
    'rows',
    'row_format',
    'second',
    'storage',
    'string',
    'sum',
    'table',
    'tables',
    'temporary',
    'terminated',
    'then',
    'to',
    'true',
    'truncate',
    'type',
    'types',
    'uncommitted',
    'unique',
    'unsigned',
    'usage',
    'use',
    'using',
    'variables',
    'view',
    'when',
    'with',
];

const reservedToplevelWords = [
    'delete from',
    'except',
    'group by',
    'order by',
    'having',
    'intersect',
    'modify',
    'select',
    'update',
    'values',
];

const unionWords = ['union all', 'union'];

const reservedToplevelInLineWords = [
    'use',
    'drop table',
    'create table',
    'from',
    'where',
    'limit',
    'create',
    'insert overwrite',
    'insert into',
    'inner join',
    'full join',
    'full outer join',
    'join',
    'left join',
    'left outer join',
    'outer join',
    'right join',
    'right outer join',
    'on',
];

const reservedNewlineWords = [
    'and',
    'or',
    'partitioned by',
    'row format',
    'fields terminated by',
    'lines terminated by',
    'stored as',
    'tblproperties',
    'alter table',
    'add jar',
    'after',
    'alter column',
    'cross apply',
    'cross join',
    'set',
    'when',
    'else',
];

let tokenizer;

class SparkSqlFormatter {
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
        //
        if (!tokenizer) {
            tokenizer = new Tokenizer({
                reservedWords,
                reservedToplevelWords,
                reservedNewlineWords,
                reservedToplevelInLineWords,
                unionWords,
                stringTypes: [`""`, "N''", "''", '``', '[]'],
                openParens: ['(', 'CASE'],
                closeParens: [')', 'END'],
                indexedPlaceholderTypes: ['?'],
                lineCommentTypes: ['#', '--'],
            });
        }
        return new Formatter(this.cfg, tokenizer).format(query)
    }
}

const format = (query) => {
    return new SparkSqlFormatter({}).format(query)
};

export default format;
