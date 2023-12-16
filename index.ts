import { exec } from 'child_process'

const name = 'RangeFinder_Classic'
const OUTPUT_DIR = `./${name}`

const glob = new Bun.Glob("*");
for await (const filename of glob.scan("./src")) {
    const file = Bun.file(`./src/${filename}`);
    await Bun.write(`${OUTPUT_DIR}/${filename}`, file);
}

const readme = Bun.file("./README.md");
await Bun.write(`${OUTPUT_DIR}/README.md`, readme);

const license = Bun.file("./LICENSE");
await Bun.write(`${OUTPUT_DIR}/LICENSE`, license);

exec(`zip -r ${name}.zip ${name}`, (err, stdout, stderr) => {
  if (err) {
    // node couldn't execute the command
    console.log(err);
    return;
  }

  // the *entire* stdout and stderr (buffered)
  console.log(`OUTPUT: ${stdout}`);
  console.log(`ERROR: ${stderr ?? 'None'}`);
});

