const { execSync } = require("child_process");
const { progress } = require("../services/StatusService");

function formatOutput(name, output) {
  return `\n[${name}] ${output.toString().split("\n").join(`\n[${name}] `)}`;
}

function makeOutputReader(name, dest) {
  return (output) => {
    dest.write(formatOutput(name, output));

    if (output.includes("100%")) {
      progress();
    }
  };
}

function execSyncCustom(name, command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    });
    console.log(formatOutput(name, output));
  } catch (error) {
    console.error(`Error in ${name}:\n${error}`);
    process.exit();
  }
}

module.exports = { formatOutput, makeOutputReader, execSyncCustom };
