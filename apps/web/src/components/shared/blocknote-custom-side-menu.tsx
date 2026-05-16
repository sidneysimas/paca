import type { Block } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
	AddBlockButton,
	DragHandleButton,
	SideMenu,
	useExtensionState,
} from "@blocknote/react";

export const CustomSideMenu = () => {
	const block = useExtensionState(SideMenuExtension, {
		selector: (state) => state?.block as Block | undefined,
	});

	if (!block) {
		return null;
	}

	const hasContent = Array.isArray(block.content) && block.content.length > 0;

	return (
		<SideMenu>
			{!hasContent && <AddBlockButton />}
			{hasContent && <DragHandleButton />}
		</SideMenu>
	);
};
