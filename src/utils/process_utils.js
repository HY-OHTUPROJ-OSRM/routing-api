const { execSync } = require('child_process');

function formatOutput(name, output) {
    return `\n[${name}] ${output.toString().split('\n').join(`\n[${name}] `)}`
}

function makeOutputReader(name, dest) {
    return (output) => {
        dest.write(formatOutput(name, output))
    }
}

function execSyncCustom(name, command) {
    try {
        console.log(formatOutput(name, execSync(command, { encoding: 'utf-8' })))
    } catch(error) {
        console.error(`Error in ${name}:\n${error}`)
        process.exit()
    }
}

module.exports = {formatOutput, makeOutputReader, execSyncCustom}
