from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

class AgentState(MessagesState):
    pass

def build_graph(model, tools):
    """
    Build the LangGraph state graph for the agent.
    """
    model_with_tools = model.bind_tools(tools)
    memory = MemorySaver()

    def reasoner(state: AgentState):
        messages = state["messages"]
        response = model_with_tools.invoke(messages)
        return {"messages": [response]}

    builder = StateGraph(AgentState)
    builder.add_node("reasoner", reasoner)
    builder.add_node("tools", ToolNode(tools))

    builder.add_edge(START, "reasoner")
    builder.add_conditional_edges("reasoner", tools_condition)
    builder.add_edge("tools", "reasoner")

    return builder.compile(checkpointer=memory)
