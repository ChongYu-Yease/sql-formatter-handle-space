import SparkSqlFormatter from './languages/SparkSqlFormatter.js'

export default {
    format: (query) => {
        return new SparkSqlFormatter({}).format(query)
    },
}
