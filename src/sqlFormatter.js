import SparkSqlFormatter from './languages/SparkSqlFormatter.js'
const format = (query) => {
    return new SparkSqlFormatter({}).format(query)
}
export default format
