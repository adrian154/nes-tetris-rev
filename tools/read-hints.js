// parse hints file for disassembly
const fs = require("fs");

module.exports = hintsFile => {

    const hints = {
        symbols: [], 
        stops: []
    };
    
    const lines = fs.readFileSync(hintsFile, "ascii").split("\n").map(l => l.trim());
    for(const line of lines) {
        const parts = line.split(/\s+/);
        if(parts[0][0] == "#") {
            continue;
        }
        if(parts[0] == "symbol") {
            if(parts.length != 3)
                throw new Error("syntax: symbol <name> <addr>");
            hints.symbols.push({name: parts[1], addr: Number(parts[2])});
        } else if(parts[0] == "stop") {
            if(parts.length != 2)
                throw new Error("syntax: stop <addr>");
            hints.stops.push(Number(parts[1]));
        }
    }

    return hints;

};