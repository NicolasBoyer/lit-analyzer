import * as ts from "typescript";
import * as vscode from "vscode-html-languageservice";
import { HtmlDocument } from "../../parsing/text-document/html-document/html-document";
import { textPartsToRanges } from "../../parsing/virtual-document/virtual-document";
import { LitFormatEdit } from "../types/lit-format-edit";

const htmlService = vscode.getLanguageService();

function makeVscTextDocument(htmlDocument: HtmlDocument): vscode.TextDocument {
	return vscode.TextDocument.create("untitled://embedded.html", "html", 1, htmlDocument.virtualDocument.text);
}

function makeVscHtmlDocument(vscTextDocument: vscode.TextDocument) {
	return htmlService.parseHTMLDocument(vscTextDocument);
}

export class VscodeHtmlService {
	doTagComplete(document: HtmlDocument, offset: number): string | undefined {
		const vscTextDocument = makeVscTextDocument(document);
		const vscHtmlDocument = makeVscHtmlDocument(vscTextDocument);
		const htmlLSPosition = vscTextDocument.positionAt(offset);

		const tagComplete = htmlService.doTagComplete(vscTextDocument, htmlLSPosition, vscHtmlDocument);
		if (tagComplete == null) return;

		// Html returns completions with snippet placeholders. Strip these out.
		return tagComplete.replace(/\$\d/g, "");
	}

	format(document: HtmlDocument, settings: ts.FormatCodeSettings): LitFormatEdit[] {
		const parts = document.virtualDocument.getPartsAtOffsetRange({
			start: 0,
			end: document.virtualDocument.location.end - document.virtualDocument.location.start
		});

		const ranges = textPartsToRanges(parts);
		const originalHtml = parts.map(p => (typeof p === "string" ? p : `[#${"#".repeat(p.getText().length)}]`)).join("");
		const vscTextDocument = vscode.TextDocument.create("untitled://embedded.html", "html", 1, originalHtml);

		const vscodeSettings: vscode.HTMLFormatConfiguration = {
			tabSize: settings.tabSize,
			insertSpaces: !!settings.convertTabsToSpaces,
			wrapLineLength: 90,
			unformatted: "",
			contentUnformatted: "pre,code,textarea",
			indentInnerHtml: true,
			preserveNewLines: true,
			maxPreserveNewLines: undefined,
			indentHandlebars: false,
			endWithNewline: false,
			extraLiners: "head, body, /html",
			wrapAttributes: "auto"
		};

		const edits = htmlService.format(vscTextDocument, undefined, vscodeSettings);

		const hasLeadingNewline = originalHtml.startsWith("\n");
		const hasTrailingNewline = originalHtml.endsWith("\n");

		const newHtml = `${hasLeadingNewline ? "\n" : ""}${vscode.TextDocument.applyEdits(vscTextDocument, edits)}${hasTrailingNewline ? "\n" : ""}`;

		const splitted = newHtml.split(/\[#+\]/);

		return splitted.map((newText, i) => {
			const range = ranges[i];
			return { range, newText };
		});
	}
}