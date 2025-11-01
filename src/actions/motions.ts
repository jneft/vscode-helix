import * as vscode from 'vscode';

import { Action } from '../action_types';
import { HelixState } from '../helix_state_types';
import { Mode } from '../modes_types';
import { paragraphBackward, paragraphForward } from '../paragraph_utils';
import { parseKeysExact, parseKeysRegex } from '../parse_keys';
import * as positionUtils from '../position_utils';
import { searchBackward, searchForward } from '../search_utils';
import {
  vimToVscodeVisualLineSelection,
  vimToVscodeVisualSelection,
  vscodeToVimVisualLineSelection,
  vscodeToVimVisualSelection,
} from '../selection_utils';
import { setVisualLineSelections } from '../visual_line_utils';
import { setVisualSelections } from '../visual_utils';
import { whitespaceWordRanges, wordRanges } from '../word_utils';
import KeyMap from './keymaps';

class MotionResult {
  readonly next: vscode.Position;
  readonly current: vscode.Position | null;

  constructor(next: vscode.Position, current: vscode.Position | null) {
    this.next = next;
    this.current = current;
  }

  static from(next: vscode.Position): MotionResult {
    return new MotionResult(next, null);
  }
}

export const motions: Action[] = [
  parseKeysExact([KeyMap.Motions.MoveRight], [Mode.Visual], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      return MotionResult.from(positionUtils.rightNormal(document, position, vimState.resolveCount()));
    });
  }),

  parseKeysExact([KeyMap.Motions.MoveLeft], [Mode.Visual], (vimState, editor) => {
    execMotion(vimState, editor, ({ position }) => {
      return MotionResult.from(positionUtils.left(position, vimState.resolveCount()));
    });
  }),

  parseKeysExact([KeyMap.Motions.MoveRight], [Mode.Normal], () => {
    vscode.commands.executeCommand('cursorRight');
  }),

  parseKeysExact([KeyMap.Motions.MoveLeft], [Mode.Normal], () => {
    vscode.commands.executeCommand('cursorLeft');
  }),

  parseKeysExact([KeyMap.Motions.MoveUp], [Mode.Normal], (_vimState, _editor) => {
    vscode.commands.executeCommand('cursorMove', {
      to: 'up',
      by: 'wrappedLine',
      value: _vimState.resolveCount(),
    });
  }),
  parseKeysExact([KeyMap.Motions.MoveUp], [Mode.Visual], (vimState, editor) => {
    const originalSelections = editor.selections;

    vscode.commands
      .executeCommand('cursorMove', {
        to: 'up',
        by: 'wrappedLine',
        select: true,
        value: vimState.resolveCount(),
      })
      .then(() => {
        setVisualSelections(editor, originalSelections);
      });
  }),
  parseKeysExact([KeyMap.Motions.MoveUp], [Mode.VisualLine], (vimState, editor) => {
    vscode.commands
      .executeCommand('cursorMove', { to: 'up', by: 'line', select: true, value: vimState.resolveCount() })
      .then(() => {
        setVisualLineSelections(editor);
      });
  }),

  parseKeysExact([KeyMap.Motions.MoveDown], [Mode.Normal], (_vimState, _editor) => {
    vscode.commands.executeCommand('cursorMove', {
      to: 'down',
      by: 'wrappedLine',
      value: _vimState.resolveCount(),
    });
  }),
  parseKeysExact([KeyMap.Motions.MoveDown], [Mode.Visual], (vimState, editor) => {
    const originalSelections = editor.selections;

    vscode.commands
      .executeCommand('cursorMove', {
        to: 'down',
        by: 'wrappedLine',
        select: true,
        value: vimState.resolveCount(),
      })
      .then(() => {
        setVisualSelections(editor, originalSelections);
      });
  }),

  parseKeysExact([KeyMap.Motions.MoveDown], [Mode.VisualLine], (vimState, editor) => {
    vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line', select: true }).then(() => {
      setVisualLineSelections(editor);
    });
  }),

  parseKeysExact(['w'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordForwardHandler(wordRanges)(vimState, editor);
    }
  }),
  parseKeysExact(['W'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordForwardHandler(whitespaceWordRanges)(vimState, editor);
    }
  }),

  parseKeysExact(['b'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordBackwardHandler(wordRanges)(vimState, editor);
    }
  }),
  parseKeysExact(['B'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordBackwardHandler(whitespaceWordRanges)(vimState, editor);
    }
  }),

  parseKeysExact(['e'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordEndHandler(wordRanges)(vimState, editor);
    }
  }),
  parseKeysExact(['E'], [Mode.Normal, Mode.Visual], (vimState, editor) => {
    const count = vimState.resolveCount();
    for (let i = 0; i < count; i++) {
      createWordEndHandler(whitespaceWordRanges)(vimState, editor);
    }
  }),

  parseKeysRegex(/^f(.)$/, /^(f|f.)$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    findForward(vimState, editor, match);

    vimState.repeatLastMotion = (innerVimState, innerEditor) => {
      findForward(innerVimState, innerEditor, match);
    };
  }),

  parseKeysRegex(/^F(.)$/, /^(F|F.)$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    findBackward(vimState, editor, match);

    vimState.repeatLastMotion = (innerVimState, innerEditor) => {
      findBackward(innerVimState, innerEditor, match);
    };
  }),

  parseKeysRegex(/^t(.)$/, /^t$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    tillForward(vimState, editor, match);

    vimState.repeatLastMotion = (innerVimState, innerEditor) => {
      tillForward(innerVimState, innerEditor, match);
    };
  }),

  parseKeysRegex(/^T(.)$/, /^T$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    tillBackward(vimState, editor, match);

    vimState.repeatLastMotion = (innerVimState, innerEditor) => {
      tillBackward(innerVimState, innerEditor, match);
    };
  }),

  parseKeysExact(['}'], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      return MotionResult.from(new vscode.Position(paragraphForward(document, position.line), 0));
    });
  }),

  parseKeysExact([']', 'p'], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      return MotionResult.from(new vscode.Position(paragraphForward(document, position.line), 0));
    });
  }),

  parseKeysExact(['{'], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      return MotionResult.from(new vscode.Position(paragraphBackward(document, position.line), 0));
    });
  }),

  parseKeysExact(['[', 'p'], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      return MotionResult.from(new vscode.Position(paragraphBackward(document, position.line), 0));
    });
  }),

  parseKeysExact([KeyMap.Motions.MoveLineEnd], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      const lineLength = document.lineAt(position.line).text.length;
      return MotionResult.from(position.with({ character: Math.max(lineLength - 1, 0) }));
    });
  }),

  parseKeysExact([KeyMap.Motions.MoveLineStart], [Mode.Normal, Mode.Visual, Mode.VisualLine], (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      const line = document.lineAt(position.line);
      return MotionResult.from(
        position.with({
          character: line.firstNonWhitespaceCharacterIndex,
        }),
      );
    });
  }),

  parseKeysExact(['H'], [Mode.Normal], (_vimState, _editor) => {
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortTop',
      by: 'line',
    });
  }),
  parseKeysExact(['H'], [Mode.Visual], (vimState, editor) => {
    const originalSelections = editor.selections;

    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortTop',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualSelections(editor, originalSelections);
      });
  }),
  parseKeysExact(['H'], [Mode.VisualLine], (vimState, editor) => {
    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortTop',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualLineSelections(editor);
      });
  }),

  parseKeysExact(['M'], [Mode.Normal], (_vimState, _editor) => {
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortCenter',
      by: 'line',
    });
  }),
  parseKeysExact(['M'], [Mode.Visual], (vimState, editor) => {
    const originalSelections = editor.selections;

    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortCenter',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualSelections(editor, originalSelections);
      });
  }),
  parseKeysExact(['M'], [Mode.VisualLine], (vimState, editor) => {
    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortCenter',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualLineSelections(editor);
      });
  }),

  parseKeysExact(['L'], [Mode.Normal], (_vimState, _editor) => {
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortBottom',
      by: 'line',
    });
  }),
  parseKeysExact(['L'], [Mode.Visual], (vimState, editor) => {
    const originalSelections = editor.selections;

    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortBottom',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualSelections(editor, originalSelections);
      });
  }),
  parseKeysExact(['L'], [Mode.VisualLine], (vimState, editor) => {
    vscode.commands
      .executeCommand('cursorMove', {
        to: 'viewPortBottom',
        by: 'line',
        select: true,
      })
      .then(() => {
        setVisualLineSelections(editor);
      });
  }),
];

type MotionArgs = {
  document: vscode.TextDocument;
  position: vscode.Position;
  selectionIndex: number;
  vimState: HelixState;
};

type RegexMotionArgs = {
  document: vscode.TextDocument;
  position: vscode.Position;
  selectionIndex: number;
  vimState: HelixState;
  match: RegExpMatchArray;
};

function execRegexMotion(
  vimState: HelixState,
  editor: vscode.TextEditor,
  match: RegExpMatchArray,
  regexMotion: (args: RegexMotionArgs) => vscode.Position,
) {
  return execMotion(vimState, editor, (motionArgs) => {
    return MotionResult.from(
      regexMotion({
        ...motionArgs,
        match: match,
      }),
    );
  });
}

function execMotion(vimState: HelixState, editor: vscode.TextEditor, motion: (args: MotionArgs) => MotionResult) {
  const document = editor.document;

  const newSelections = editor.selections.map((selection, i) => {
    if (vimState.mode === Mode.Normal) {
      const result = motion({
        document: document,
        position: selection.active,
        selectionIndex: i,
        vimState: vimState,
      });
      return new vscode.Selection(result.current!, result.next);
    } else if (vimState.mode === Mode.Visual) {
      const vimSelection = vscodeToVimVisualSelection(document, selection);
      const result = motion({
        document: document,
        position: vimSelection.active,
        selectionIndex: i,
        vimState: vimState,
      });

      return vimToVscodeVisualSelection(document, new vscode.Selection(vimSelection.anchor, result.next));
    } else if (vimState.mode === Mode.VisualLine) {
      const vimSelection = vscodeToVimVisualLineSelection(document, selection);
      const result = motion({
        document: document,
        position: vimSelection.active,
        selectionIndex: i,
        vimState: vimState,
      });

      return vimToVscodeVisualLineSelection(document, new vscode.Selection(vimSelection.anchor, result.next));
    } else {
      return selection;
    }
  });

  editor.selections = newSelections;

  editor.revealRange(
    new vscode.Range(newSelections[0].active, newSelections[0].active),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

function findForward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = position.with({ character: position.character + 1 });
    const result = searchForward(document, match[1], fromPosition);

    if (result) {
      return result.with({ character: result.character + 1 });
    } else {
      return position;
    }
  });
}

function findBackward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = positionLeftWrap(document, position);
    const result = searchBackward(document, match[1], fromPosition);

    if (result) {
      return result;
    } else {
      return position;
    }
  });
}

function tillForward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = position.with({ character: position.character + 1 });
    const result = searchForward(document, match[1], fromPosition);

    if (result) {
      return result.with({ character: result.character });
    } else {
      return position;
    }
  });
}

function tillBackward(vimState: HelixState, editor: vscode.TextEditor, outerMatch: RegExpMatchArray): void {
  execRegexMotion(vimState, editor, outerMatch, ({ document, position, match }) => {
    const fromPosition = positionLeftWrap(document, position);
    const result = searchBackward(document, match[1], fromPosition);

    if (result) {
      return result;
    } else {
      return position;
    }
  });
}

function positionLeftWrap(document: vscode.TextDocument, position: vscode.Position): vscode.Position {
  if (position.character === 0) {
    if (position.line === 0) {
      return position;
    } else {
      const lineLength = document.lineAt(position.line - 1).text.length;
      return new vscode.Position(position.line - 1, lineLength);
    }
  } else {
    return position.with({ character: position.character - 1 });
  }
}

function createWordForwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      let character = position.character;
      let lineOffset = 0;
      let lineText = '';

      // as long as at end of line or empty goto next one (e.g finds next relevant line)
      for (let i = 0; i <= document.lineCount - position.line; i++) {
        lineText = document.lineAt(position.line + lineOffset).text;
        if (character < lineText.length - 1) break;
        // if just jumped to line that is not empty (e.g. has a space or tab) stay on it
        if (lineOffset > 0 && lineText.length > 0) break;
        // else go to next line
        lineOffset++;
        character = 0;
      }

      const ranges = wordRangesFunction(lineText);
      let nextChar = character;
      let prevChar = nextChar;

      let foundWord = false;
      for (let value of ranges) {
        // if character is at start of line after jumping to next line,
        // and first word is one space or tab away stay there
        if (character < value.start - 1 || (character == 0 && lineOffset > 0)) {
          nextChar = value.start - 1;
          foundWord = true;
          break;
        }
        prevChar = value.start;
      }

      if (!foundWord) nextChar = lineText.length - 1;

      const newLine = position.line + lineOffset;
      // set cursor position and therefore end of selection
      const nextPosition = position.with({ line: newLine, character: nextChar });
      // set start of selection
      const currentPosition = position.with({ line: newLine, character: prevChar });

      return new MotionResult(nextPosition, currentPosition);
    });
  };
}

function createWordBackwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      let character = position.character;
      let lineOffset = 0;
      let lineText = document.lineAt(position.line).text;

      // as long as at start of line goto end of next one (e.g finds next relevant line)
      for (let i = 0; i <= position.line; i++) {
        if (character != 0) break;
        lineOffset--;
        lineText = document.lineAt(position.line + lineOffset).text;
        character = lineText.length;
      }

      // reverse so to start the lookup loop from the back
      const ranges = wordRangesFunction(lineText).reverse();
      let nextChar = character;
      let prevChar = nextChar;

      let foundWord = false;
      for (let value of ranges) {
        if (character > value.start) {
          nextChar = value.start;
          foundWord = true;
          break;
        }
        prevChar = value.start;
      }

      if (!foundWord) nextChar = 0;

      const newLine = position.line + lineOffset;
      // set cursor position and therefore end of selection
      const nextPosition = position.with({ line: newLine, character: nextChar });
      // set start of selection
      const currentPosition = position.with({ line: newLine, character: prevChar });

      return new MotionResult(nextPosition, currentPosition);
    });
  };
}

function createWordEndHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    execMotion(vimState, editor, ({ document, position }) => {
      const lineText = document.lineAt(position.line).text;
      const ranges = wordRangesFunction(lineText);

      const result = ranges.find((x) => x.end > position.character);

      if (result) {
        const onWordEnd = ranges.find((x) => x.end == position.character);

        const currentPos = onWordEnd ? position.with({ character: position.character + 1 }) : position;

        return new MotionResult(position.with({ character: result.end }), currentPos);
      } else {
        return new MotionResult(position, position);
      }
    });
  };
}
