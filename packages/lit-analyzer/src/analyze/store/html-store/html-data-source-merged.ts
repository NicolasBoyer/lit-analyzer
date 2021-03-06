import { SimpleType, SimpleTypeKind, SimpleTypeUnion } from "ts-simple-type";
import {
	HtmlAttr,
	HtmlDataCollection,
	HtmlEvent,
	HtmlMember,
	HtmlProp,
	HtmlSlot,
	HtmlTag,
	mergeHtmlAttrs,
	mergeHtmlEvents,
	mergeHtmlProps,
	mergeHtmlSlots,
	mergeHtmlTags,
	NamedHtmlDataCollection
} from "../../parse/parse-html-data/html-tag";
import { lazy } from "../../util/general-util";
import { iterableDefined } from "../../util/iterable-util";
import { HtmlDataSource } from "./html-data-source";

export enum HtmlDataSourceKind {
	DECLARED = 0,
	USER = 1,
	BUILD_IN = 2
}

export class HtmlDataSourceMerged {
	private subclassExtensions = new Map<string, HtmlTag>();

	private htmlDataSources: HtmlDataSource[] = (() => {
		const array: HtmlDataSource[] = [];
		array[HtmlDataSourceKind.BUILD_IN] = new HtmlDataSource();
		array[HtmlDataSourceKind.USER] = new HtmlDataSource();
		array[HtmlDataSourceKind.DECLARED] = new HtmlDataSource();
		return array;
	})();

	private combinedHtmlDataSource = new HtmlDataSource();

	private relatedForTagName = {
		attrs: new Map<string, ReadonlyMap<string, HtmlAttr>>(),
		events: new Map<string, ReadonlyMap<string, HtmlEvent>>(),
		slots: new Map<string, ReadonlyMap<string, HtmlSlot>>(),
		props: new Map<string, ReadonlyMap<string, HtmlProp>>()
	};

	get globalTags(): ReadonlyMap<string, HtmlTag> {
		return this.combinedHtmlDataSource.globalTags;
	}

	invalidateCache(collection?: NamedHtmlDataCollection) {
		if (collection == null) {
			Object.values(this.relatedForTagName).forEach(map => map.clear());
			return;
		}

		const {
			tags,
			global: { attributes, events }
		} = collection;

		if (tags && tags.length > 0) {
			Object.values(this.relatedForTagName).forEach(map => tags.forEach(tagName => map.delete(tagName)));
		}

		if (attributes && attributes.length > 0) {
			this.relatedForTagName.attrs.clear();
		}

		if (events && events.length > 0) {
			this.relatedForTagName.events.clear();
		}
	}

	mergeDataSourcesAndInvalidate(collection: NamedHtmlDataCollection) {
		const {
			tags,
			global: { events, attributes, properties, slots }
		} = collection;

		if (tags != null) {
			for (const tagName of tags) {
				const allTags = iterableDefined(this.htmlDataSources.map(r => r.getGlobalTag(tagName)));

				if (allTags.length > 0) {
					const mergedTags = allTags.length === 1 ? allTags : mergeHtmlTags(allTags);
					this.combinedHtmlDataSource.absorbCollection({ tags: mergedTags });
				}
			}
		}

		if (attributes != null) {
			for (const attrName of attributes) {
				const allAttrs = iterableDefined(this.htmlDataSources.map(r => r.getGlobalAttribute(attrName)));

				if (allAttrs.length > 0) {
					const mergedAttrs = allAttrs.length === 1 ? allAttrs : mergeHtmlAttrs(allAttrs);
					this.combinedHtmlDataSource.absorbCollection({ global: { attributes: mergedAttrs } });
				}
			}
		}

		if (events != null) {
			for (const eventName of events) {
				const allEvents = iterableDefined(this.htmlDataSources.map(r => r.getGlobalEvent(eventName)));

				if (allEvents.length > 0) {
					const mergedEvents = allEvents.length === 1 ? allEvents : mergeHtmlEvents(allEvents);
					this.combinedHtmlDataSource.absorbCollection({ global: { events: mergedEvents } });
				}
			}
		}

		if (properties != null) {
			for (const propName of properties) {
				const allProps = iterableDefined(this.htmlDataSources.map(r => r.getGlobalProperty(propName)));

				if (allProps.length > 0) {
					const mergedProps = allProps.length === 1 ? allProps : mergeHtmlProps(allProps);
					this.combinedHtmlDataSource.absorbCollection({ global: { properties: mergedProps } });
				}
			}
		}

		if (slots != null) {
			for (const slotName of slots) {
				const allSlots = iterableDefined(this.htmlDataSources.map(r => r.getGlobalSlot(slotName)));

				if (allSlots.length > 0) {
					const mergedSlots = allSlots.length === 1 ? allSlots : mergeHtmlSlots(allSlots);
					this.combinedHtmlDataSource.absorbCollection({ global: { slots: mergedSlots } });
				}
			}
		}

		this.invalidateCache(collection);
	}

	forgetCollection(collection: NamedHtmlDataCollection, dataSource?: HtmlDataSourceKind) {
		if (dataSource == null) {
			this.htmlDataSources.forEach(ds => ds.forgetCollection(collection));
		} else {
			this.htmlDataSources[dataSource].forgetCollection(collection);
		}

		this.combinedHtmlDataSource.forgetCollection(collection);
		this.mergeDataSourcesAndInvalidate(collection);
	}

	absorbCollection(collection: HtmlDataCollection, register: HtmlDataSourceKind) {
		this.htmlDataSources[register].absorbCollection(collection);

		this.mergeDataSourcesAndInvalidate({
			tags: collection.tags.map(t => t.tagName),
			global: {
				events: collection.global?.events?.map(t => t.name),
				attributes: collection.global?.attributes?.map(a => a.name),
				properties: collection.global?.properties?.map(p => p.name),
				slots: collection.global?.slots?.map(s => s.name)
			}
		});
	}

	getHtmlTag(tagName: string): HtmlTag | undefined {
		return this.combinedHtmlDataSource.getGlobalTag(tagName);
	}

	absorbSubclassExtension(name: string, extension: HtmlTag) {
		this.subclassExtensions.set(name, extension);
	}

	getSubclassExtensions(tagName: string): HtmlTag[] {
		// Right now, always return "HTMLElement" subclass extension
		const extension = this.subclassExtensions.get("HTMLElement");
		return extension != null ? [extension] : [];
	}

	getAllAttributesForTag(tagName: string): ReadonlyMap<string, HtmlAttr> {
		if (!this.relatedForTagName.attrs.has(tagName)) {
			this.relatedForTagName.attrs.set(tagName, mergeRelatedMembers(this.iterateAllAttributesForNode(tagName)));
		}

		return this.relatedForTagName.attrs.get(tagName)!;
	}

	getAllPropertiesForTag(tagName: string): ReadonlyMap<string, HtmlProp> {
		if (!this.relatedForTagName.props.has(tagName)) {
			this.relatedForTagName.props.set(tagName, mergeRelatedMembers(this.iterateAllPropertiesForNode(tagName)));
		}

		return this.relatedForTagName.props.get(tagName)!;
	}

	getAllEventsForTag(tagName: string): ReadonlyMap<string, HtmlEvent> {
		if (!this.relatedForTagName.events.has(tagName)) {
			this.relatedForTagName.events.set(tagName, mergeRelatedEvents(this.iterateAllEventsForNode(tagName)));
		}

		return this.relatedForTagName.events.get(tagName)!;
	}

	getAllSlotForTag(tagName: string): ReadonlyMap<string, HtmlSlot> {
		if (!this.relatedForTagName.slots.has(tagName)) {
			this.relatedForTagName.slots.set(tagName, mergeRelatedSlots(this.iterateAllSlotsForNode(tagName)));
		}

		return this.relatedForTagName.slots.get(tagName)!;
	}

	private iterateGlobalAttributes(): Iterable<HtmlAttr> {
		return this.combinedHtmlDataSource.globalAttributes.values();
	}

	private iterateGlobalEvents(): Iterable<HtmlEvent> {
		return this.combinedHtmlDataSource.globalEvents.values();
	}

	private iterateGlobalProperties(): Iterable<HtmlProp> {
		return this.combinedHtmlDataSource.globalProperties.values();
	}

	private iterateGlobalSlots(): Iterable<HtmlSlot> {
		return this.combinedHtmlDataSource.globalSlots.values();
	}

	private *iterateAllPropertiesForNode(tagName: string): Iterable<HtmlProp> {
		// Html tag properties
		const htmlTag = this.getHtmlTag(tagName);
		if (htmlTag != null) yield* htmlTag.properties;

		// Extension properties
		const extensions = this.getSubclassExtensions(tagName);
		for (const extTag of extensions) {
			yield* extTag.properties;
		}

		// Global propertjes
		yield* this.iterateGlobalProperties();
	}

	private *iterateAllEventsForNode(tagName: string): Iterable<HtmlEvent> {
		// Html tag events
		const htmlTag = this.getHtmlTag(tagName);
		if (htmlTag != null) yield* htmlTag.events;

		// Extension events
		const extensions = this.getSubclassExtensions(tagName);
		for (const extTag of extensions) {
			yield* extTag.events;
		}

		// All events on other tags (because they bubble)
		if (htmlTag == null || htmlTag.events.length === 0) {
			for (const tag of this.globalTags.values()) {
				if (tag.tagName !== tagName) {
					yield* tag.events;
				}
			}

			// Global events
			yield* this.iterateGlobalEvents();
		} else {
			// If we emitted some events from the main html tag, don't emit these events again
			const eventNameSet = new Set(htmlTag.events.map(e => e.name));

			for (const tag of this.globalTags.values()) {
				if (tag.tagName !== tagName) {
					for (const evt of tag.events) {
						if (!eventNameSet.has(evt.name)) {
							yield evt;
						}
					}
				}
			}

			// Global events
			for (const evt of this.iterateGlobalEvents()) {
				if (!eventNameSet.has(evt.name)) {
					yield evt;
				}
			}
		}
	}

	private *iterateAllAttributesForNode(tagName: string): Iterable<HtmlAttr> {
		// Html tag attributes
		const htmlTag = this.getHtmlTag(tagName);
		if (htmlTag != null) yield* htmlTag.attributes;

		// Extension attributes
		const extensions = this.getSubclassExtensions(tagName);
		for (const extTag of extensions) {
			yield* extTag.attributes;
		}

		// Global attributes
		yield* this.iterateGlobalAttributes();
	}

	private *iterateAllSlotsForNode(tagName: string): Iterable<HtmlSlot> {
		// Html tag attributes
		const htmlTag = this.getHtmlTag(tagName);
		if (htmlTag != null) yield* htmlTag.slots;

		// Extension attributes
		const extensions = this.getSubclassExtensions(tagName);
		for (const extTag of extensions) {
			yield* extTag.slots;
		}

		// Global slots
		yield* this.iterateGlobalSlots();
	}
}

function mergeRelatedMembers<T extends HtmlMember>(members: Iterable<T>): ReadonlyMap<string, T> {
	const mergedMembers = new Map<string, T>();
	for (const member of members) {
		// For now, lowercase all names because "parse5" doesn't distinguish between uppercase and lowercase
		const name = member.name.toLowerCase();

		const existingMember = mergedMembers.get(name);
		if (existingMember == null) {
			mergedMembers.set(name, member);
		} else {
			const prevType = existingMember.getType;
			mergedMembers.set(name, {
				...existingMember,
				description: undefined,
				required: existingMember.required && member.required,
				builtIn: existingMember.required && member.required,
				fromTagName: existingMember.fromTagName || member.fromTagName,
				getType: lazy(() => mergeRelatedTypeToUnion(prevType(), member.getType())),
				related: existingMember.related == null ? [existingMember, member] : [...existingMember.related, member]
			});
		}
	}
	return mergedMembers;
}

function mergeRelatedTypeToUnion(typeA: SimpleType, typeB: SimpleType): SimpleType {
	if (typeA.kind === typeB.kind) {
		switch (typeA.kind) {
			case SimpleTypeKind.ANY:
				return typeA;
		}
	}

	switch (typeA.kind) {
		case SimpleTypeKind.UNION:
			if (typeB.kind === SimpleTypeKind.ANY && typeA.types.find(t => t.kind === SimpleTypeKind.ANY) != null) {
				return typeA;
			} else {
				return {
					...typeA,
					types: [...typeA.types, typeB]
				};
			}
	}

	return {
		kind: SimpleTypeKind.UNION,
		types: [typeA, typeB]
	} as SimpleTypeUnion;
}

function mergeRelatedSlots(slots: Iterable<HtmlSlot>): ReadonlyMap<string, HtmlSlot> {
	const mergedSlots = new Map<string, HtmlSlot>();
	for (const slot of slots) {
		// For now, lowercase all names because "parse5" doesn't distinguish between uppercase and lowercase
		const name = slot.name.toLowerCase();

		mergedSlots.set(name, slot);
	}
	return mergedSlots;
}

function mergeRelatedEvents(events: Iterable<HtmlEvent>): ReadonlyMap<string, HtmlEvent> {
	const mergedAttrs = new Map<string, HtmlEvent>();
	for (const event of events) {
		// For now, lowercase all names because "parse5" doesn't distinguish between uppercase and lowercase
		const name = event.name.toLowerCase();

		const existingEvent = mergedAttrs.get(name);
		if (existingEvent == null) {
			mergedAttrs.set(name, event);
		} else {
			const prevType = existingEvent.getType;
			mergedAttrs.set(name, {
				...existingEvent,
				global: existingEvent.global && event.global,
				description: undefined,
				getType: lazy(() => mergeRelatedTypeToUnion(prevType(), event.getType())),
				related: existingEvent.related == null ? [existingEvent, event] : [...existingEvent.related, event],
				fromTagName: existingEvent.fromTagName || event.fromTagName
			});
		}
	}
	return mergedAttrs;
}
