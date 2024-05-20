// parse hints file for disassembly
const fs = require("fs");

module.exports = hintsFile => {

    const hints = {
        symbols: [], 
        nonreturns: [],
        constants: {},
        retaddrAdjust: {}
    };
    
    const lines = fs.readFileSync(hintsFile, "ascii").split("\n").map(l => l.trim());
    for(const line of lines) {
        const parts = line.split(/\s+/);
        if(parts[0][0] == "#" || line == "") {
            continue;
        }
        if(parts[0] == "symbol") {
            if(parts.length != 3)
                throw new Error("Syntax: symbol <name> <addr>");
            hints.symbols.push({name: parts[1], addr: Number(parts[2])});
        } else if(parts[0] == "nonreturn") {
            if(parts.length != 2)
                throw new Error("Syntax: nonreturn <addr>");
            hints.nonreturns.push(Number(parts[1]));
        } else if(parts[0] == "constant") {
            if(parts.length != 3)
                throw new Error("Syntax: constant <name> <value>");
            hints.constants[Number(parts[2])] = parts[1];
        } else if(parts[0] == "retaddr-adjust") {
            if(parts.length != 3)
                throw new Error("Syntax: retaddr-adjust <addr> <amount>");
            hints.retaddrAdjust[Number(parts[1])] = Number(parts[2]);
        } else {
            throw new Error("Unknown directive " + parts[0]);
        }
    }

    return hints;

};