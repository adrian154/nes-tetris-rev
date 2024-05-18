// a very basic NES ROM disassembler
// many assumptions associated with the NES Tetris cartridge are hardcoded, so it definitely won't work for all NES ROMs
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
	0x00: {name: "BRK", addressing: ADDRESSING_MODES.IMPLICIT, branch: true },
	0x01: {name: "ORA", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x05: {name: "ORA", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x06: {name: "ASL", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x08: {name: "PHP", addressing: ADDRESSING_MODES.IMPLICIT },
	0x09: {name: "ORA", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x0a: {name: "ASL", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x0d: {name: "ORA", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x0e: {name: "ASL", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x10: {name: "BPL", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x11: {name: "ORA", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x15: {name: "ORA", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x16: {name: "ASL", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x18: {name: "CLC", addressing: ADDRESSING_MODES.IMPLICIT },
	0x19: {name: "ORA", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x1d: {name: "ORA", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x1e: {name: "ASL", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x20: {name: "JSR", addressing: ADDRESSING_MODES.ABSOLUTE, branch: true },
	0x21: {name: "AND", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x24: {name: "BIT", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x25: {name: "AND", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x26: {name: "ROL", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x28: {name: "PLP", addressing: ADDRESSING_MODES.IMPLICIT },
	0x29: {name: "AND", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x2a: {name: "ROL", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x2c: {name: "BIT", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x2d: {name: "AND", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x2e: {name: "ROL", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x30: {name: "BMI", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x31: {name: "AND", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x35: {name: "AND", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x36: {name: "ROL", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x38: {name: "SEC", addressing: ADDRESSING_MODES.IMPLICIT },
	0x39: {name: "AND", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x3d: {name: "AND", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x3e: {name: "ROL", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x40: {name: "RTI", addressing: ADDRESSING_MODES.IMPLICIT, branch: true, terminal: true },
	0x41: {name: "EOR", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x45: {name: "EOR", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x46: {name: "LSR", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x48: {name: "PHA", addressing: ADDRESSING_MODES.IMPLICIT },
	0x49: {name: "EOR", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x4a: {name: "LSR", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x4c: {name: "JMP", addressing: ADDRESSING_MODES.ABSOLUTE, branch: true, terminal: true },
	0x4d: {name: "EOR", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x4e: {name: "LSR", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x50: {name: "BVC", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x51: {name: "EOR", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x55: {name: "EOR", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x56: {name: "LSR", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x58: {name: "CLI", addressing: ADDRESSING_MODES.IMPLICIT },
	0x59: {name: "EOR", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x5d: {name: "EOR", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x5e: {name: "LSR", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x60: {name: "RTS", addressing: ADDRESSING_MODES.IMPLICIT, branch: true, terminal: true },
	0x61: {name: "ADC", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x65: {name: "ADC", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x66: {name: "ROR", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x68: {name: "PLA", addressing: ADDRESSING_MODES.IMPLICIT },
	0x69: {name: "ADC", addressing: ADDRESSING_MODES.IMMEDIATE },
	0x6a: {name: "ROR", addressing: ADDRESSING_MODES.ACCUMULATOR },
	0x6c: {name: "JMP", addressing: ADDRESSING_MODES.INDIRECT, branch: true },
	0x6d: {name: "ADC", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x6e: {name: "ROR", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x70: {name: "BVS", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x71: {name: "ADC", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x75: {name: "ADC", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x76: {name: "ROR", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x78: {name: "SEI", addressing: ADDRESSING_MODES.IMPLICIT },
	0x79: {name: "ADC", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x7d: {name: "ADC", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x7e: {name: "ROR", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0x81: {name: "STA", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0x84: {name: "STY", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x85: {name: "STA", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x86: {name: "STX", addressing: ADDRESSING_MODES.ZEROPAGE },
	0x88: {name: "DEY", addressing: ADDRESSING_MODES.IMPLICIT },
	0x8a: {name: "TXA", addressing: ADDRESSING_MODES.IMPLICIT },
	0x8c: {name: "STY", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x8d: {name: "STA", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x8e: {name: "STX", addressing: ADDRESSING_MODES.ABSOLUTE },
	0x90: {name: "BCC", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0x91: {name: "STA", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0x94: {name: "STY", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x95: {name: "STA", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0x96: {name: "STX", addressing: ADDRESSING_MODES.ZEROPAGE_Y },
	0x98: {name: "TYA", addressing: ADDRESSING_MODES.IMPLICIT },
	0x99: {name: "STA", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0x9a: {name: "TXS", addressing: ADDRESSING_MODES.IMPLICIT },
	0x9d: {name: "STA", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xa0: {name: "LDY", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xa1: {name: "LDA", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xa2: {name: "LDX", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xa4: {name: "LDY", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa5: {name: "LDA", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa6: {name: "LDX", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xa8: {name: "TAY", addressing: ADDRESSING_MODES.IMPLICIT },
	0xa9: {name: "LDA", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xaa: {name: "TAX", addressing: ADDRESSING_MODES.IMPLICIT },
	0xac: {name: "LDY", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xad: {name: "LDA", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xae: {name: "LDX", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xb0: {name: "BCS", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xb1: {name: "LDA", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xb4: {name: "LDY", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xb5: {name: "LDA", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xb6: {name: "LDX", addressing: ADDRESSING_MODES.ZEROPAGE_Y },
	0xb8: {name: "CLV", addressing: ADDRESSING_MODES.IMPLICIT },
	0xb9: {name: "LDA", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xba: {name: "TSX", addressing: ADDRESSING_MODES.IMPLICIT },
	0xbc: {name: "LDY", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xbd: {name: "LDA", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xbe: {name: "LDX", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xc0: {name: "CPY", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xc1: {name: "CMP", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xc4: {name: "CPY", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc5: {name: "CMP", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc6: {name: "DEC", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xc8: {name: "INY", addressing: ADDRESSING_MODES.IMPLICIT },
	0xc9: {name: "CMP", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xca: {name: "DEX", addressing: ADDRESSING_MODES.IMPLICIT },
	0xcc: {name: "CPY", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xcd: {name: "CMP", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xce: {name: "DEC", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xd0: {name: "BNE", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xd1: {name: "CMP", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xd5: {name: "CMP", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xd6: {name: "DEC", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xd8: {name: "CLD", addressing: ADDRESSING_MODES.IMPLICIT },
	0xd9: {name: "CMP", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xdd: {name: "CMP", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xde: {name: "DEC", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xe0: {name: "CPX", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xe1: {name: "SBC", addressing: ADDRESSING_MODES.INDEXED_INDIRECT },
	0xe4: {name: "CPX", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe5: {name: "SBC", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe6: {name: "INC", addressing: ADDRESSING_MODES.ZEROPAGE },
	0xe8: {name: "INX", addressing: ADDRESSING_MODES.IMPLICIT },
	0xe9: {name: "SBC", addressing: ADDRESSING_MODES.IMMEDIATE },
	0xea: {name: "NOP", addressing: ADDRESSING_MODES.IMPLICIT },
	0xec: {name: "CPX", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xed: {name: "SBC", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xee: {name: "INC", addressing: ADDRESSING_MODES.ABSOLUTE },
	0xf0: {name: "BEQ", addressing: ADDRESSING_MODES.RELATIVE, branch: true },
	0xf1: {name: "SBC", addressing: ADDRESSING_MODES.INDIRECT_INDEXED },
	0xf5: {name: "SBC", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xf6: {name: "INC", addressing: ADDRESSING_MODES.ZEROPAGE_X },
	0xf8: {name: "SED", addressing: ADDRESSING_MODES.IMPLICIT },
	0xf9: {name: "SBC", addressing: ADDRESSING_MODES.ABSOLUTE_Y },
	0xfd: {name: "SBC", addressing: ADDRESSING_MODES.ABSOLUTE_X },
	0xfe: {name: "INC", addressing: ADDRESSING_MODES.ABSOLUTE_X },
};

// decode INES ROM format
const readROM = rom => {

    if(INES_HEADER_MAGIC.compare(rom.subarray(0, 4)) != 0) {
        throw new Error("ROM header magic incorrect");
    }

    const prgRomSize = rom[4] * 16384,
          chrRomSize = rom[5] * 8192;

    return {
        prgRom: rom.subarray(16, 16 + prgRomSize),
        rom: rom.subarray(16 + prgRomSize, 16 + prgRomSize + chrRomSize)
    };

};

// formatting instructions
const addrToLabel = addr => "lab_" + addr.toString(16).padStart(4, '0');
const byte2hex = byte => byte.toString(16).padStart(2, '0');
const word2hex = word => word.toString(16).padStart(4, '0');

const disassemble = prgRom => {

    // record branch targets so labels can be inserted in the output assembly
    const branchTargets = [];

    // each byte in the program ROM is either part of an instruction or data
    // we associate the first byte of each opcode with the decoded instruction, and assume everything else is data
    const bytes = new Array(prgRom.length);
    for(let i = 0; i < prgRom.length; i++) {
        bytes[i] = {type: "data", value: prgRom[i]};
    }

    const disassembleRecursive = startPC => {

        // record branch target
        branchTargets.push(startPC);

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
                throw new Error(`Unknown opcode 0x${opcode.toString(16).padStart(2, '0')}`);
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
                    const target = insnOffset + 2 + readByte();
                    disasm = `${insn.name} $${word2hex(target)}`;
                    break;
                case ADDRESSING_MODES.ABSOLUTE:
                    disasm = `${insn.name} $${word2hex(readWord())}`;
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

            console.log(`${prgRom.subarray(insnOffset-PRG_ROM_BASE, pc-PRG_ROM_BASE).toString("hex")}: ${disasm}`);

            // tag first byte of instruction with disassembly, and null the other bytes of the instruction
            bytes[insnOffset] = disasm;
            for(let i = insnOffset + 1; i < pc; i++) {
                bytes[i] = null;
            }

            // follow branches
            
            // if branch was terminal, don't continue disassembling
            if(insn.terminal) {
                break;
            }

        }

    };

    // start disassembly at known branch targets
    disassembleRecursive(prgRom.readUInt16LE(NMI_VECTOR - PRG_ROM_BASE));
    disassembleRecursive(prgRom.readUInt16LE(RESET_VECTOR - PRG_ROM_BASE));
    disassembleRecursive(prgRom.readUInt16LE(IRQ_VECTOR - PRG_ROM_BASE));

};

const rom = readROM(fs.readFileSync(process.argv[2]));
disassemble(rom.prgRom);