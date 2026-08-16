import { Fragment } from "react";

import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import type { ChatModelDefinition } from "@/lib/model-catalog";

const CHATGPT_SUBSCRIPTION_PROVIDER = "subscription/chatgpt";

type ModelSelectGroupsProps = {
  models: readonly ChatModelDefinition[];
};

/** Keeps model access sources distinct everywhere the shared picker is used. */
export function ModelSelectGroups({ models }: ModelSelectGroupsProps) {
  const sections = [
    {
      id: "api-key",
      label: "API key",
      models: models.filter(
        (model) => model.provider !== CHATGPT_SUBSCRIPTION_PROVIDER,
      ),
    },
    {
      id: "chatgpt-subscription",
      label: "ChatGPT subscription",
      models: models.filter(
        (model) => model.provider === CHATGPT_SUBSCRIPTION_PROVIDER,
      ),
    },
  ].filter((section) => section.models.length > 0);

  return sections.map((section, index) => (
    <Fragment key={section.id}>
      {index > 0 ? <SelectSeparator /> : null}
      <SelectGroup>
        <SelectLabel>{section.label}</SelectLabel>
        {section.models.map((model) => (
          <SelectItem key={model.id} value={`model:${model.id}`}>
            {model.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </Fragment>
  ));
}
