// a very basic NES ROM disassembler
// many assumptions associated with the NES Tetris cartridge are hardcoded, so it definitely won't work for all NES ROMs
const parseHints = require("./read-hints.js");
const fs = require("fs");

const INES_HEADER_MAGIC = Buffer.from([0x4e, 0x45, 0x53, 0x1a]);

const NMI_VECTOR = 0xfffa,
      RESET_VECTOR = 0xfffc,
      IRQ_VECTOR = 0xfffe;

// assumed memory layout: PRG ROM from 0x8000-0xFFFF 
const PRG_ROM_BASE = 0x8000;

// constants representing 6502 addressing modes
const ADDRESSING_MODES = {
    IMPLICIT: 0,
    ACCUMULATOR: 1,
    IMMEDIATE: 2,
    ZEROPAGE: 3,
    ZEROPAGE_X: 4,
    ZEROPAGE_Y: 5,
    RELATIVE: 6,
    ABSOLUTE: 7,
    ABSOLUTE_X: 8,
    ABSOLUTE_Y: 9,
    INDIRECT: 10,
    INDEXED_INDIRECT: 11,
    INDIRECT_INDEXED: 12
};

// instruction decoding information
// `terminal` indicates that the disassembler should not proceed past this instruction; this is mainly used for unconditional jumps
const INSTRUCTIONS = {
	0x00: {name: "brk", addressing: ADDRESSING_MODES.IMPLICIT, branch: true },
	0x01: {name: "ora", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x05: {name: "ora", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x06: {name: "asl", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x08: {name: "php", addressing: ADDRESSING_MODES.IMPLICIT },
	0x09: {name: "ora", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x0a: {name: "asl", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x0d: {name: "ora", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x0e: {name: "asl", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x10: {name: "bpl", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x11: {name: "ora", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x15: {name: "ora", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x16: {name: "asl", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x18: {name: "clc", addressing: ADDRESSING_MODES.IMPLICIT },
	0x19: {name: "ora", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x1d: {name: "ora", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x1e: {name: "asl", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x20: {name: "jsr", addressing: ADDRESSING_MODES.ABSOLUTE, branch: true },
	0x21: {name: "and", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x24: {name: "bit", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x25: {name: "and", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x26: {name: "rol", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x28: {name: "plp", addressing: ADDRESSING_MODES.IMPLICIT },
	0x29: {name: "and", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x2a: {name: "rol", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x2c: {name: "bit", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x2d: {name: "and", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x2e: {name: "rol", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x30: {name: "bmi", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x31: {name: "and", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x35: {name: "and", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x36: {name: "rol", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x38: {name: "sec", addressing: ADDRESSING_MODES.IMPLICIT },
	0x39: {name: "and", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x3d: {name: "and", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x3e: {name: "rol", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x40: {name: "rti", addressing: ADDRESSING_MODES.IMPLICIT, terminal: true },
	0x41: {name: "eor", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x45: {name: "eor", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x46: {name: "lsr", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x48: {name: "pha", addressing: ADDRESSING_MODES.IMPLICIT },
	0x49: {name: "eor", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x4a: {name: "lsr", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x4c: {name: "jmp", addressing: ADDRESSING_MODES.ABSOLUTE, branch: true, terminal: true },
	0x4d: {name: "eor", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x4e: {name: "lsr", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x50: {name: "bvc", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x51: {name: "eor", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x55: {name: "eor", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x56: {name: "lsr", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x58: {name: "cli", addressing: ADDRESSING_MODES.IMPLICIT },
	0x59: {name: "eor", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x5d: {name: "eor", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x5e: {name: "lsr", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x60: {name: "rts", addressing: ADDRESSING_MODES.IMPLICIT, terminal: true },
	0x61: {name: "adc", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x65: {name: "adc", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x66: {name: "ror", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x68: {name: "pla", addressing: ADDRESSING_MODES.IMPLICIT },
	0x69: {name: "adc", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x6a: {name: "ror", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x6c: {name: "jmp", addressing: ADDRESSING_MODES.INDIRECT, branch: true, terminal: true },
	0x6d: {name: "adc", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x6e: {name: "ror", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x70: {name: "bvs", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x71: {name: "adc", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x75: {name: "adc", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x76: {name: "ror", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x78: {name: "sei", addressing: ADDRESSING_MODES.IMPLICIT },
	0x79: {name: "adc", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x7d: {name: "adc", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x7e: {name: "ror", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x81: {name: "sta", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x84: {name: "sty", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x85: {name: "sta", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x86: {name: "stx", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x88: {name: "dey", addressing: ADDRESSING_MODES.IMPLICIT },
	0x8a: {name: "txa", addressing: ADDRESSING_MODES.IMPLICIT },
	0x8c: {name: "sty", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x8d: {name: "sta", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x8e: {name: "stx", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x90: {name: "bcc", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x91: {name: "sta", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x94: {name: "sty", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x95: {name: "sta", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x96: {name: "stx", addressing: ADDRESSING_MODES.ZEROPAGE_Y },
	0x98: {name: "tya", addressing: ADDRESSING_MODES.IMPLICIT },
	0x99: {name: "sta", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x9a: {name: "txs", addressing: ADDRESSING_MODES.IMPLICIT },
	0x9d: {name: "sta", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xa0: {name: "ldy", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xa1: {name: "lda", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xa2: {name: "ldx", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xa4: {name: "ldy", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa5: {name: "lda", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa6: {name: "ldx", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa8: {name: "tay", addressing: ADDRESSING_MODES.IMPLICIT },
	0xa9: {name: "lda", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xaa: {name: "tax", addressing: ADDRESSING_MODES.IMPLICIT },
	0xac: {name: "ldy", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xad: {name: "lda", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xae: {name: "ldx", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xb0: {name: "bcs", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xb1: {name: "lda", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xb4: {name: "ldy", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xb5: {name: "lda", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xb6: {name: "ldx", addressing: ADDRESSING_MODES.ZEROPAGE_Y },
	0xb8: {name: "clv", addressing: ADDRESSING_MODES.IMPLICIT },
	0xb9: {name: "lda", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xba: {name: "tsx", addressing: ADDRESSING_MODES.IMPLICIT },
	0xbc: {name: "ldy", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xbd: {name: "lda", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xbe: {name: "ldx", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xc0: {name: "cpy", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xc1: {name: "cmp", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xc4: {name: "cpy", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc5: {name: "cmp", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc6: {name: "dec", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc8: {name: "iny", addressing: ADDRESSING_MODES.IMPLICIT },
	0xc9: {name: "cmp", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xca: {name: "dex", addressing: ADDRESSING_MODES.IMPLICIT },
	0xcc: {name: "cpy", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xcd: {name: "cmp", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xce: {name: "dec", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xd0: {name: "bne", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xd1: {name: "cmp", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xd5: {name: "cmp", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xd6: {name: "dec", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xd8: {name: "cld", addressing: ADDRESSING_MODES.IMPLICIT },
	0xd9: {name: "cmp", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xdd: {name: "cmp", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xde: {name: "dec", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xe0: {name: "cpx", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xe1: {name: "sbc", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xe4: {name: "cpx", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe5: {name: "sbc", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe6: {name: "inc", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe8: {name: "inx", addressing: ADDRESSING_MODES.IMPLICIT },
	0xe9: {name: "sbc", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xea: {name: "nop", addressing: ADDRESSING_MODES.IMPLICIT },
	0xec: {name: "cpx", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xed: {name: "sbc", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xee: {name: "inc", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xf0: {name: "beq", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xf1: {name: "sbc", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xf5: {name: "sbc", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xf6: {name: "inc", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xf8: {name: "sed", addressing: ADDRESSING_MODES.IMPLICIT },
	0xf9: {name: "sbc", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xfd: {name: "sbc", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xfe: {name: "inc", addressing: ADDRESSING_MODES.ABSOLUTE_X },
};

// decode INES ROM format
const readROM = rom => {

    if(INES_HEADER_MAGIC.compare(rom.subarray(0, 4)) != 0) {
        throw new Error("ROM header magic incorrect");
    }

    const prgRomSize = rom[4] * 16384, chrRomSize = rom[5] * 8192;
    return {
        prgRom: rom.subarray(16, 16 + prgRomSize),
        rom: rom.subarray(16 + prgRomSize, 16 + prgRomSize + chrRomSize)
    };

};

// formatting instructions
const byte2hex = byte => byte.toString(16).padStart(2, '0');
const word2hex = word => word.toString(16).padStart(4, '0');

const warn = (addr, message) => console.log(`warning: $${word2hex(addr)}: ${message}`);

class DisassemblyError extends Error {
    constructor(offset, message) {
        super(`$${word2hex(offset)}: ${message}`);
    }
}

const disassemble = (prgRom, hints) => {

    // each byte in the program ROM is either part of an instruction or data
    // we associate the first byte of each opcode with the decoded instruction, and assume everything else is data
    const byteTags = new Array(prgRom.length);
    for(let i = 0; i < prgRom.length; i++) {
        byteTags[i] = {data: prgRom[i]};
    }

    const lookupSymbol = addr => hints.symbols.find(symbol => symbol.addr == addr)?.name;
    //const addrToLabel = addr => hints.symbols.find(symbol => symbol.addr == addr)?.name ||  "_label_" + addr.toString(16).padStart(4, '0');

    const disassembleRecursive = startPC => {

        // if this location has already been disassembled, don't need to go over it again
        const tag = byteTags[startPC - PRG_ROM_BASE];
        if(tag == null) {
            throw new DisassemblyError(startPC, "Jump to middle of instruction detected");
        }
        if(tag.disasm) {
            return;
        }

        let pc = startPC;
        const readByte = () => prgRom[pc++ - PRG_ROM_BASE];
        const readWord = () => {
            const retval = prgRom.readUInt16LE(pc - PRG_ROM_BASE);
            pc += 2;
            return retval;
        };

        while(1) {

            // read opcode
            const insnOffset = pc;
            const opcode = readByte();
            const insn = INSTRUCTIONS[opcode];
            if(!insn) {
                throw new DisassemblyError(insnOffset, `Unknown opcode 0x${opcode.toString(16).padStart(2, '0')}`);
            }

            // when possible, resolve branch targets ahead of time
            let target = null;
            if(insn.addressing == ADDRESSING_MODES.RELATIVE) {
                const nextPC = insnOffset + 2, 
                      offset = readByte() << 24 >> 24; // sign-extend 
                target = nextPC + offset;
            } else if(insn.addressing == ADDRESSING_MODES.ABSOLUTE) {
                target = readWord();
            }

            // if instruction is a branch and target is known, resolve symbol or create new one
            let symbol = null;
            if(insn.branch && target != null) {
                symbol = lookupSymbol(target);
                if(!symbol) {
                    symbol = (insn.name == "jsr" ? "_func_" : "_label_") + word2hex(target);
                    hints.symbols.push({name: symbol, addr: target});
                }
            }

            // decode operands
            let disasm = null;
            switch(insn.addressing) {
                case ADDRESSING_MODES.IMPLICIT:
                    disasm = insn.name;
                    break;
                case ADDRESSING_MODES.ACCUMULATOR:
                    disasm = `${insn.name} A`;
                    break;
                case ADDRESSING_MODES.IMMEDIATE:
                    disasm = `${insn.name} #$${byte2hex(readByte())}`;
                    break;
                case ADDRESSING_MODES.ZEROPAGE:
                    disasm = `${insn.name} $${byte2hex(readByte())}`;
                    break;
                case ADDRESSING_MODES.ZEROPAGE_X:
                    disasm = `${insn.name} $${byte2hex(readByte())},X`;
                    break;
                case ADDRESSING_MODES.ZEROPAGE_Y:
                    disasm = `${insn.name} $${byte2hex(readByte())},Y`;
                    break;
                case ADDRESSING_MODES.RELATIVE:
                    disasm = `${insn.name} ${symbol}`;
                    break;
                case ADDRESSING_MODES.ABSOLUTE:
                    if(insn.branch)
                        disasm = `${insn.name} ${symbol}`;
                    else
                        disasm = `${insn.name} $${word2hex(target)}`;
                    break;
                case ADDRESSING_MODES.ABSOLUTE_X:
                    disasm = `${insn.name} $${word2hex(readWord())},X`;
                    break;
                case ADDRESSING_MODES.ABSOLUTE_Y:
                    disasm = `${insn.name} $${word2hex(readWord())},Y`;
                    break;
                case ADDRESSING_MODES.INDIRECT:
                    disasm = `${insn.name} $(${word2hex(readWord())})`;
                    break;
                case ADDRESSING_MODES.INDEXED_INDIRECT:
                    disasm = `${insn.name} ($${byte2hex(readByte())},X)`;
                    break;
                case ADDRESSING_MODES.INDIRECT_INDEXED:
                    disasm = `${insn.name} ($${byte2hex(readByte())}),Y`;
                    break;
            }

            // warn if target could not be identified
            if(insn.branch && target == null) {
                warn(insnOffset, "Could not resolve branch target, disassembly may be incomplete");
            }

            // tag first byte of instruction with disassembly, and null the other bytes of the instruction
            const tag = {disasm, length: pc - insnOffset};
            byteTags[insnOffset - PRG_ROM_BASE] = tag;
            for(let i = insnOffset + 1; i < pc; i++) {
                byteTags[i - PRG_ROM_BASE] = null;
            }

            // if there's a branch, disassemble the target
            if(insn.branch) {
                if(target) {
                    try {
                        disassembleRecursive(target);
                    } catch(error) {
                        console.error(error);
                    }
                } else {
                    tag.unknownTarget = true;
                }
            }

            // if a branch is "terminal", then we do not expect execution to continue afterwards
            // we can infer this for certain instructions (unconditional branches)
            if(insn.terminal || (insn.name == "jsr" && hints.nonreturns.includes(target))) {
                return;
            }

        }

    };

    // start disassembly from known execution locations, and also register symbols for them
    hints.symbols.push({name: "_nmi", addr: prgRom.readUInt16LE(NMI_VECTOR - PRG_ROM_BASE)});
    hints.symbols.push({name: "_reset", addr: prgRom.readUInt16LE(RESET_VECTOR - PRG_ROM_BASE)});
    hints.symbols.push({name: "_irq", addr: prgRom.readUInt16LE(IRQ_VECTOR - PRG_ROM_BASE)});

    for(const {addr} of hints.symbols) {
        try {
            disassembleRecursive(Number(addr));
        } catch(error) {
            console.error(error);
        }
    }

    // write output
    let outLines = [];
    for(let i = 0; i < byteTags.length; i++) {
        
        const addr = i + PRG_ROM_BASE;

        const symbols = hints.symbols.filter(symbol => symbol.addr == addr);
        for(const symbol of symbols) {
            outLines.push(symbol.name + ":");
        }

        const tag = byteTags[i];
        if(tag != null) {
            const hexdump = Array.from(prgRom.subarray(i, i + (tag.length || 1))).map(byte2hex).join(" ");
            outLines.push(`    ${word2hex(addr)}: ${hexdump.padEnd(15, ' ')} ${(tag.disasm || "??").padEnd(16, ' ')} ${tag.unknownTarget ? "; (auto) unknown target" : ""}`);
        }

    }

    return outLines.join("\n");

};

// usage: node tools/disassemble.js [IN-ROM] [HINTS-FILE] [OUT-DUMP]
const rom = readROM(fs.readFileSync(process.argv[2]));
const hints = parseHints(process.argv[3]);
fs.writeFileSync(process.argv[4], disassemble(rom.prgRom, hints));