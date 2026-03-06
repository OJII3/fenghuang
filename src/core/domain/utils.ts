/** Escape user-supplied content before embedding in XML tags to prevent injection */
export function escapeXmlContent(content: string): string {
	return content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
