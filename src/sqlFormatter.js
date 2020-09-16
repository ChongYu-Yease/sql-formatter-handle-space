import SparkSqlFormatter from './languages/SparkSqlFormatter.js'
const format = (query) => new SparkSqlFormatter({}).format(query)
export default format
