const WORDS = ['autumn','beach','birch','bloom','breeze','brook','canyon','cedar','cliff','cloud','coral','creek','dune','ember','fern','fjord','flint','frost','glade','grove','haven','heath','hedge','inlet','ivory','jade','kelp','knoll','lagoon','larch','ledge','lemon','lotus','maple','marsh','meadow','mesa','mist','moss','oaken','ocean','olive','orchid','pebble','pine','prism','quartz','raven','reed','ridge','river','robin','rocky','sage','salt','sand','shell','shore','slate','smoke','snow','solar','spire','spruce','stone','storm','stream','summit','surf','thorn','tide','timber','trail','vale','vapor','vine','violet','vista','wave','willow','wind','wren'];

export function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export function worktreeBranchName(issuePrefix: string): string {
  return `${issuePrefix}-${randomWord()}`;
}
